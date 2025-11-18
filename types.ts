import { TFile } from "obsidian";

// 定义Canvas文件关联组
export interface CanvasGroup {
	files: string[];  // 关联的canvas文件路径
	lastSync: number; // 最后同步时间戳
}

// 插件设置
export interface CanvasSyncSettings {
	canvasGroups: CanvasGroup[];
}

// 默认设置
export const DEFAULT_SETTINGS: CanvasSyncSettings = {
	canvasGroups: []
};

// Canvas节点类型
export enum CanvasNodeType {
	Text = "text",
	File = "file",
	Link = "link",
	Group = "group",
}

// 节点数据接口
export interface CanvasNodeData {
	id: string;
	type: CanvasNodeType;
	text?: string;
	file?: string;
	url?: string;
	subtype?: string;
	width?: number;
	height?: number;
	x: number;
	y: number;
}

// 操作类型
export enum OperationType {
	CreateNode,
	DeleteNode,
	UpdateNodeText
}

// 操作接口
export interface Operation {
	type: OperationType;
	data: any;  // 根据操作类型存储不同的数据
	sourceFile: string; // 操作来源文件
}

// 简化的Canvas数据结构（根据Obsidian的Canvas数据格式）
export interface CanvasData {
	nodes: { [key: string]: CanvasNodeData };
	edges: any[];
}
