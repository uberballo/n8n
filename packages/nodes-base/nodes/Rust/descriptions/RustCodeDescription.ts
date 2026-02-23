import type { INodeProperties } from 'n8n-workflow';

export const rustCodeDescription: INodeProperties[] = [
	{
		displayName: 'Rust Code',
		name: 'rustCode',
		type: 'string',
		typeOptions: {
			editor: 'codeNodeEditor',
			editorLanguage: 'rust',
		},
		default: `fn main() {
    let input: Vec<serde_json::Value> = serde_json::from_reader(std::io::stdin()).expect("invalid JSON");
    let output: Vec<serde_json::Value> = input.into_iter().map(|item| item).collect();
    serde_json::to_writer(std::io::stdout(), &output).expect("write");
}`,
		description:
			'Rust code. Read JSON array of input items from stdin, write JSON array of output items to stdout.',
		noDataExpression: true,
		displayOptions: {
			show: {
				mode: ['runOnceForAllItems'],
			},
		},
	},
	{
		displayName:
			"Rust must be installed on the machine you're running this on. Input is sent as JSON on stdin; output is read as JSON from stdout.",
		name: 'notice',
		type: 'notice',
		displayOptions: {
			show: {},
		},
		default: '',
	},
];
