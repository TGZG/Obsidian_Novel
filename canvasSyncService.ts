import { App, TFile, Notice } from "obsidian";
import { CanvasGroup, CanvasData, Operation, OperationType, CanvasNodeData } from "./types";

export class CanvasSyncService {
	private app: App;
	private canvasGroups: CanvasGroup[];
	private processingOperations: boolean = false;
	private operationQueue: Operation[] = [];

	constructor(app: App, canvasGroups: CanvasGroup[]) {
		this.app = app;
		this.canvasGroups = canvasGroups;
	}

	// 获取所有Canvas组
	getCanvasGroups(): CanvasGroup[] {
		return this.canvasGroups;
	}

	// 设置Canvas组
	setCanvasGroups(groups: CanvasGroup[]): void {
		this.canvasGroups = groups;
	}

	// 查找文件所属的Canvas组
	findGroupForFile(filePath: string): CanvasGroup | null {
		for (const group of this.canvasGroups) {
			if (group.files.includes(filePath)) {
				return group;
			}
		}
		return null;
	}

	// 创建新的Canvas视图
	async createNewCanvasView(sourceFilePath: string): Promise<string | null> {
		try {
			// 查找源文件
			const sourceFile = this.app.vault.getAbstractFileByPath(sourceFilePath);
			if (!sourceFile || !(sourceFile instanceof TFile)) {
				new Notice('无法找到源Canvas文件');
				return null;
			}

			// 读取源Canvas数据
			const sourceContent = await this.app.vault.read(sourceFile);
			const sourceData = JSON.parse(sourceContent);

			// 确定新文件名
			const baseName = sourceFile.name.replace('.canvas', '');
			let version = 1;

			// 检查是否已经是C1, C2等格式
			const match = baseName.match(/(.+)C(\d+)$/);
			if (match) {
				const baseNameWithoutNumber = match[1];
				version = parseInt(match[2]);

				// 查找组中的其他文件，确定下一个版本号
				const group = this.findGroupForFile(sourceFilePath);
				if (group) {
					// 寻找现有最高版本号
					let maxVersion = version;
					const versionPattern = new RegExp(`^${baseNameWithoutNumber}C(\\d+)\\.canvas$`);

					for (const filePath of group.files) {
						const fileName = filePath.split('/').pop();
						const vMatch = fileName?.match(versionPattern);
						if (vMatch) {
							const fileVersion = parseInt(vMatch[1]);
							maxVersion = Math.max(maxVersion, fileVersion);
						}
					}
					version = maxVersion + 1;
				} else {
					version += 1;
				}

				// 创建新文件名
				const newFileName = `${baseNameWithoutNumber}C${version}.canvas`;
				const newFilePath = sourceFile.path.replace(sourceFile.name, newFileName);

				// 创建新文件
				await this.app.vault.create(newFilePath, sourceContent);

				// 更新或创建Canvas组
				await this.updateCanvasGroup(sourceFilePath, newFilePath);

				new Notice(`已创建新的Canvas视图: ${newFileName}`);
				return newFilePath;
			} else {
				// 原文件不是C格式的，创建C1版本
				const newFileName = `${baseName}C1.canvas`;
				const newFilePath = sourceFile.path.replace(sourceFile.name, newFileName);

				// 创建新文件
				await this.app.vault.create(newFilePath, sourceContent);

				// 更新或创建Canvas组
				await this.updateCanvasGroup(sourceFilePath, newFilePath);

				new Notice(`已创建新的Canvas视图: ${newFileName}`);
				return newFilePath;
			}
		} catch (error) {
			console.error('创建新视图时出错:', error);
			new Notice('创建Canvas视图失败: ' + error.message);
			return null;
		}
	}

	// 更新或创建Canvas组
	private async updateCanvasGroup(sourceFilePath: string, newFilePath: string): Promise<void> {
		// 寻找文件是否已经在某个组中
		let group = this.findGroupForFile(sourceFilePath);

		if (group) {
			// 如果源文件已经在组中，将新文件也添加到该组
			if (!group.files.includes(newFilePath)) {
				group.files.push(newFilePath);
				group.lastSync = Date.now();
			}
		} else {
			// 如果源文件不在任何组中，创建新组
			const newGroup: CanvasGroup = {
				files: [sourceFilePath, newFilePath],
				lastSync: Date.now()
			};
			this.canvasGroups.push(newGroup);
		}
	}

	// 处理Canvas操作并同步到相关文件
	async processOperation(operation: Operation): Promise<void> {
		// 将操作添加到队列
		this.operationQueue.push(operation);

		// 如果已经在处理操作，直接返回
		if (this.processingOperations) {
			return;
		}

		this.processingOperations = true;

		try {
			// 处理队列中的所有操作
			while (this.operationQueue.length > 0) {
				const op = this.operationQueue.shift();
				if (!op) {
					console.error('处理Canvas操作时出错:op为null');
					return;
				}
				await this.executeOperation(op);
			}
		} catch (error) {
			console.error('处理Canvas操作时出错:', error);
			new Notice('同步Canvas操作失败: ' + error.message);
		} finally {
			this.processingOperations = false;
		}
	}

	// 执行具体的操作
	private async executeOperation(operation: Operation): Promise<void> {
		// 获取源文件所在的组
		const group = this.findGroupForFile(operation.sourceFile);
		if (!group) {
			return; // 文件不在任何同步组中
		}

		// 更新组的同步时间
		group.lastSync = Date.now();

		// 同步到组内的其他文件
		for (const filePath of group.files) {
			// 跳过源文件
			if (filePath === operation.sourceFile) {
				continue;
			}

			// 获取目标文件
			const targetFile = this.app.vault.getAbstractFileByPath(filePath);
			if (!targetFile || !(targetFile instanceof TFile)) {
				console.warn(`无法找到目标文件: ${filePath}`);
				continue;
			}

			try {
				// 读取目标Canvas数据
				const content = await this.app.vault.read(targetFile);
				const canvasData: CanvasData = JSON.parse(content);

				// 根据操作类型进行相应的修改
				switch (operation.type) {
					case OperationType.CreateNode:
						this.handleCreateNode(canvasData, operation.data);
						break;
					case OperationType.DeleteNode:
						this.handleDeleteNode(canvasData, operation.data);
						break;
					case OperationType.UpdateNodeText:
						this.handleUpdateNodeText(canvasData, operation.data);
						break;
				}

				// 保存修改后的数据
				await this.app.vault.modify(targetFile, JSON.stringify(canvasData, null, 2));
			} catch (error) {
				console.error(`同步到文件 ${filePath} 时出错:`, error);
			}
		}
	}

	// 处理创建节点操作
	private handleCreateNode(canvasData: CanvasData, nodeData: CanvasNodeData): void {
		// 添加新节点
		canvasData.nodes[nodeData.id] = nodeData;
	}

	// 处理删除节点操作
	private handleDeleteNode(canvasData: CanvasData, nodeId: string): void {
		// 删除节点
		delete canvasData.nodes[nodeId];

		// 同时删除与该节点相关的边
		canvasData.edges = canvasData.edges.filter(edge =>
			edge.fromNode !== nodeId && edge.toNode !== nodeId
		);
	}

	// 处理更新节点文本操作
	private handleUpdateNodeText(canvasData: CanvasData, data: { nodeId: string, newText: string }): void {
		const { nodeId, newText } = data;

		// 更新节点文本
		if (canvasData.nodes[nodeId]) {
			canvasData.nodes[nodeId].text = newText;
		}
	}
}
