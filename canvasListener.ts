import { WorkspaceLeaf, Menu, TFile } from "obsidian";
import { CanvasSyncService } from "./canvasSyncService";
import { OperationType } from "./types";

// Canvas API 接口（由于Obsidian不直接导出这些类型，我们需要自己定义）
interface CanvasView {
	file: TFile;
	canvas: any; // Canvas实例
}

export class CanvasListener {
	private plugin: any;
	private syncService: CanvasSyncService;
	private registeredCanvasViews: Map<string, any> = new Map();
	private nodeObservers: Map<string, Map<string, MutationObserver>> = new Map();

	constructor(plugin: any, syncService: CanvasSyncService) {
		this.plugin = plugin;
		this.syncService = syncService;
	}

	// 初始化监听器
	initialize(): void {
		// 添加右键菜单项
		this.registerContextMenu();

		// 注册工作区布局变化事件，用于检测新打开的Canvas视图
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('layout-change', () => {
				this.checkForNewCanvasViews();
			})
		);
	}

	// 注册右键菜单
	private registerContextMenu(): void {
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('file-menu', (menu: Menu, file: TFile) => {
				// 只对Canvas文件添加菜单
				if (file && file.extension === 'canvas') {
					menu.addItem((item) => {
						item.setTitle('创建新视图')
							.setIcon('duplicate')
							.onClick(async () => {
								await this.syncService.createNewCanvasView(file.path);
							});
					});
				}
			})
		);
	}

	// 检查并注册新打开的Canvas视图
	private checkForNewCanvasViews(): void {
		const leaves = this.plugin.app.workspace.getLeavesOfType('canvas');

		for (const leaf of leaves) {
			this.registerCanvasView(leaf);
		}
	}

	// 注册Canvas视图
	private registerCanvasView(leaf: WorkspaceLeaf): void {
		const view = leaf.view as unknown as CanvasView;

		if (!view || !view.file || !view.canvas) {
			return;
		}

		const filePath = view.file.path;

		// 检查是否已经注册过该视图
		if (this.registeredCanvasViews.has(filePath)) {
			return;
		}

		// 检查该文件是否在同步组中
		const group = this.syncService.findGroupForFile(filePath);
		if (!group) {
			return; // 不在同步组中，不需要监听
		}

		// 注册该视图
		this.registeredCanvasViews.set(filePath, view);

		// 注册Canvas事件
		this.registerCanvasEvents(view, filePath);
	}

	// 注册Canvas事件
	private registerCanvasEvents(view: CanvasView, filePath: string): void {
		const canvas = view.canvas;

		// 节点创建事件
		this.plugin.register(
			canvas.on('node:added', (node: any) => {
				this.handleNodeCreated(node, filePath);
			})
		);

		// 节点删除事件
		this.plugin.register(
			canvas.on('node:deleted', (nodeId: string) => {
				this.handleNodeDeleted(nodeId, filePath);
			})
		);

		// 节点内容变化事件 - 这个比较复杂，可能需要MutationObserver
		this.setupTextNodeObservers(canvas, filePath);
	}

	// 设置文本节点观察器
	private setupTextNodeObservers(canvas: any, filePath: string): void {
		// 获取所有节点
		const nodes = canvas.nodes;

		// 创建观察器映射
		if (!this.nodeObservers.has(filePath)) {
			this.nodeObservers.set(filePath, new Map());
		}

		const fileObservers = this.nodeObservers.get(filePath);
		if (fileObservers) {
			// 为每个文本节点设置观察器
			for (const nodeId in nodes) {
				const node = nodes[nodeId];
				if (node.type === 'text' && node.element) {
					this.observeTextNode(node, filePath, fileObservers);
				}
			}

			// 监听新节点添加，为它们也设置观察器
			this.plugin.register(
				canvas.on('node:added', (node: any) => {
					if (node.type === 'text' && node.element) {
						setTimeout(() => {
							this.observeTextNode(node, filePath, fileObservers);
						}, 100); // 给一点时间让DOM元素完全渲染
					}
				})
			);
		}
	}

	// 为文本节点设置观察器
	private observeTextNode(node: any, filePath: string, observers: Map<string, MutationObserver>): void {
		// 如果已经有观察器，先断开连接
		if (observers.has(node.id)) {
			let A = observers.get(node.id);
			if (A) {
				A.disconnect();
			}
		}

		// 找到文本内容元素
		const textElement = node.element.querySelector('.canvas-node-content');
		if (!textElement) return;

		// 创建新的观察器
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type === 'characterData' || mutation.type === 'childList') {
					// 获取新的文本内容
					const newText = textElement.textContent || '';

					// 发送更新事件
					this.handleNodeTextChanged(node.id, newText, filePath);
					break;
				}
			}
		});

		// 配置观察器
		observer.observe(textElement, {
			characterData: true,
			childList: true,
			subtree: true
		});

		// 存储观察器
		observers.set(node.id, observer);
	}

	// 处理节点创建事件
	private handleNodeCreated(node: any, filePath: string): void {
		// 构建节点数据
		const nodeData = {
			id: node.id,
			type: node.type,
			x: node.x,
			y: node.y,
			width: node.width,
			height: node.height,
			text: "",
			file: "",
			url: "",
		};

		// 添加特定类型的属性
		if (node.type === 'text') {
			nodeData.text = node.text || '';
		} else if (node.type === 'file') {
			nodeData.file = node.file || '';
		} else if (node.type === 'link') {
			nodeData.url = node.url || '';
		}

		// 发送到同步服务
		this.syncService.processOperation({
			type: OperationType.CreateNode,
			data: nodeData,
			sourceFile: filePath
		});
	}

	// 处理节点删除事件
	private handleNodeDeleted(nodeId: string, filePath: string): void {
		this.syncService.processOperation({
			type: OperationType.DeleteNode,
			data: nodeId,
			sourceFile: filePath
		});
	}

	// 处理节点文本变更事件
	private handleNodeTextChanged(nodeId: string, newText: string, filePath: string): void {
		this.syncService.processOperation({
			type: OperationType.UpdateNodeText,
			data: { nodeId, newText },
			sourceFile: filePath
		});
	}

	// 清理资源
	unload(): void {
		// 清理所有观察器
		this.nodeObservers.forEach(observers => {
			observers.forEach(observer => observer.disconnect());
		});

		this.nodeObservers.clear();
		this.registeredCanvasViews.clear();
	}
}
