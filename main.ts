import { Plugin, PluginSettingTab, Setting } from 'obsidian';
import { CanvasSyncSettings, DEFAULT_SETTINGS, CanvasGroup } from './types';
import { CanvasSyncService } from './canvasSyncService';
import { CanvasListener } from './canvasListener';

export default class CanvasSyncPlugin extends Plugin {
	settings: CanvasSyncSettings;
	syncService: CanvasSyncService;
	canvasListener: CanvasListener;

	async onload() {
		// 加载设置
		await this.loadSettings();

		// 初始化同步服务
		this.syncService = new CanvasSyncService(this.app, this.settings.canvasGroups);

		// 初始化Canvas监听器
		this.canvasListener = new CanvasListener(this, this.syncService);
		this.canvasListener.initialize();

		// 添加设置选项卡
		this.addSettingTab(new CanvasSyncSettingTab(this.app, this));

		// 注册事件：当插件卸载时保存设置
		this.registerEvent(
			this.app.workspace.on('quit', () => {
				this.settings.canvasGroups = this.syncService.getCanvasGroups();
				this.saveSettings();
			})
		);

		console.log('Canvas Sync插件已加载');
	}

	onunload() {
		// 保存设置
		this.settings.canvasGroups = this.syncService.getCanvasGroups();
		this.saveSettings();

		// 清理Canvas监听器
		if (this.canvasListener) {
			this.canvasListener.unload();
		}

		console.log('Canvas Sync插件已卸载');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// 设置界面
class CanvasSyncSettingTab extends PluginSettingTab {
	plugin: CanvasSyncPlugin;

	constructor(app: any, plugin: CanvasSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Canvas Sync 设置' });

		// 当前同步组信息
		const groups = this.plugin.syncService.getCanvasGroups();

		containerEl.createEl('h3', { text: '当前同步组' });

		if (groups.length === 0) {
			containerEl.createEl('p', { text: '目前没有Canvas同步组。右键点击Canvas文件并选择"创建新视图"来创建同步组。' });
		} else {
			const groupListEl = containerEl.createEl('div', { cls: 'canvas-sync-group-list' });

			groups.forEach((group: CanvasGroup, index: number) => {
				const groupEl = groupListEl.createEl('div', { cls: 'canvas-sync-group' });

				groupEl.createEl('h4', { text: `同步组 #${index + 1}` });

				const fileListEl = groupEl.createEl('ul');
				group.files.forEach((filePath: string) => {
					fileListEl.createEl('li', { text: filePath });
				});

				// 添加删除按钮
				new Setting(groupEl)
					.setName('删除此同步组')
					.addButton(button => button
						.setButtonText('删除')
						.setWarning()
						.onClick(async () => {
							// 确认删除
							if (confirm('确定要删除此同步组吗？这不会删除Canvas文件，只会解除它们的同步关系。')) {
								// 删除组
								groups.splice(index, 1);

								// 更新服务和设置
								this.plugin.syncService.setCanvasGroups(groups);
								this.plugin.settings.canvasGroups = groups;
								await this.plugin.saveSettings();

								// 重新显示设置
								this.display();
							}
						})
					);
			});
		}

		// 添加手动清除所有同步组的按钮
		new Setting(containerEl)
			.setName('重置所有同步关系')
			.setDesc('清除所有Canvas文件之间的同步关系。这不会删除任何文件。')
			.addButton(button => button
				.setButtonText('重置')
				.setWarning()
				.onClick(async () => {
					// 确认重置
					if (confirm('确定要重置所有同步关系吗？这将解除所有Canvas文件之间的同步关联。')) {
						// 重置组
						this.plugin.syncService.setCanvasGroups([]);
						this.plugin.settings.canvasGroups = [];
						await this.plugin.saveSettings();

						// 重新显示设置
						this.display();
					}
				})
			);
	}
}
