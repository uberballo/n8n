import set from 'lodash/set';
import {
	NodeConnectionTypes,
	type CodeExecutionMode,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';

import { rustCodeDescription } from './descriptions/RustCodeDescription';
import { runRustCode } from './RustExecutor';

export class Rust implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Rust',
		name: 'rust',
		icon: 'file:rust.svg',
		group: ['transform'],
		version: 1,
		description: 'Run custom Rust code. Input and output are JSON via stdin/stdout.',
		defaults: {
			name: 'Rust',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		parameterPane: 'wide',
		properties: [
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Run Once for All Items',
						value: 'runOnceForAllItems',
						description: 'Run once with all input items as JSON array on stdin',
					},
					{
						name: 'Run Once for Each Item',
						value: 'runOnceForEachItem',
						description: 'Run once per input item, each with one item as JSON array on stdin',
					},
				],
				default: 'runOnceForAllItems',
			},
			...rustCodeDescription,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const node = this.getNode();
		const mode = this.getNodeParameter('mode', 0) as CodeExecutionMode;
		const rustCode = this.getNodeParameter('rustCode', 0) as string;
		const inputItems = this.getInputData();

		if (!rustCode?.trim()) {
			throw new Error('Rust code is empty. Add code to the Rust node.');
		}

		let items: INodeExecutionData[];
		try {
			items = await runRustCode(node, rustCode, inputItems, mode);
		} catch (error) {
			if (!this.continueOnFail()) {
				set(error, 'node', node);
				throw error;
			}
			items = [{ json: { error: (error as Error).message } }];
		}

		return [items];
	}
}
