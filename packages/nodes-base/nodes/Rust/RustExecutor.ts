import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { dir as tmpDir } from 'tmp-promise';

import type { IDataObject, INode, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

const CARGO_TOML = `[package]
name = "n8n_rust"
version = "0.1.0"
edition = "2021"

[dependencies]
serde_json = "1.0"
`;

const EXECUTION_TIMEOUT_MS = 120_000;

const CARGO_PATH = process.env.N8N_RUST_CARGO_PATH || 'cargo';

/**
 * Run user Rust code in a temp directory: write Cargo.toml + src/main.rs,
 * run `cargo run`, pass input as JSON on stdin, parse output from stdout.
 *
 * Just a quick poc, if this would work. Let's try to make some benchmark workflows for fun
 */
export async function runRustCode(
	node: INode,
	rustCode: string,
	inputItems: INodeExecutionData[],
	mode: 'runOnceForAllItems' | 'runOnceForEachItem',
): Promise<INodeExecutionData[]> {
	const tmp = await tmpDir({ unsafeCleanup: true });
	const cwd = tmp.path;

	try {
		await fs.mkdir(path.join(cwd, 'src'), { recursive: true });
		await fs.writeFile(path.join(cwd, 'Cargo.toml'), CARGO_TOML, 'utf8');
		await fs.writeFile(path.join(cwd, 'src', 'main.rs'), rustCode, 'utf8');

		if (mode === 'runOnceForAllItems') {
			const output = await runCargo(node, cwd, inputItems);
			return normalizeOutputItems(output);
		}

		const results: INodeExecutionData[] = [];
		for (let i = 0; i < inputItems.length; i++) {
			const output = await runCargo(node, cwd, [inputItems[i]]);
			const items = normalizeOutputItems(output);
			const item = items[0] ?? { json: {} };
			results.push({ ...item, pairedItem: { item: i } });
		}
		return results;
	} finally {
		await tmp.cleanup();
	}
}

function runCargo(node: INode, cwd: string, inputItems: INodeExecutionData[]): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const proc = spawn(CARGO_PATH, ['run', '--quiet'], {
			cwd,
			stdio: ['pipe', 'pipe', 'pipe'],
			shell: process.platform === 'win32',
		});

		let stdout = '';
		let stderr = '';

		proc.stdout?.on('data', (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		proc.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		const timeout = setTimeout(() => {
			proc.kill('SIGKILL');
			reject(
				new NodeOperationError(node, 'Rust execution timed out (compile + run).', {
					description: `stdout: ${stdout.slice(-500)}\nstderr: ${stderr.slice(-500)}`,
				}),
			);
		}, EXECUTION_TIMEOUT_MS);

		proc.on('error', (err) => {
			clearTimeout(timeout);
			const isSpawnError =
				(err as NodeJS.ErrnoException).code === 'ENOENT' || err.message?.includes('spawn');
			if (isSpawnError) {
				const hint =
					CARGO_PATH !== 'cargo'
						? `Check that N8N_RUST_CARGO_PATH (${CARGO_PATH}) is correct.`
						: 'Something went wrong.';
				reject(
					new NodeOperationError(node, 'Rust (cargo) not found.', {
						description: `${err.message}\n\n${hint}\n\nInstall from https://rustup.rs`,
					}),
				);
			} else {
				reject(err);
			}
		});

		proc.on('close', (code) => {
			clearTimeout(timeout);
			if (code !== 0) {
				reject(
					new NodeOperationError(node, `Rust compilation or execution failed (exit code ${code})`, {
						description: stderr || stdout,
					}),
				);
				return;
			}
			try {
				const parsed = JSON.parse(stdout.trim() || '[]');
				resolve(parsed);
			} catch {
				reject(
					new NodeOperationError(node, 'Rust code did not output valid JSON on stdout', {
						description: stdout.slice(-1000) || '(empty)',
					}),
				);
			}
		});

		const inputJson = JSON.stringify(inputItems.map((item) => item.json));
		proc.stdin?.write(inputJson, (err) => {
			if (err) reject(err);
			proc.stdin?.end();
		});
	});
}

function normalizeOutputItems(output: unknown): INodeExecutionData[] {
	if (!Array.isArray(output)) {
		return [{ json: (output ?? {}) as IDataObject, pairedItem: { item: 0 } }];
	}
	return output.map((item, index) => {
		const obj = item && typeof item === 'object' && !Array.isArray(item) ? item : { value: item };
		const json = 'json' in obj ? (obj as { json: IDataObject }).json : (obj as IDataObject);
		return {
			json,
			pairedItem: { item: index },
		};
	});
}
