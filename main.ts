import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';

// 插件设置接口
interface SimplePluginSettings {
	message: string;
}

// 默认设置
const DEFAULT_SETTINGS: SimplePluginSettings = {
	message: '这是一个测试消息！'
}

export default class SimpleTestPlugin extends Plugin {
	settings: SimplePluginSettings;
	statusBarItemEl: HTMLElement;

	async onload() {
		await this.loadSettings();

		// 创建一个状态栏项目
		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarItemEl.setText('测试插件已加载');

		// 添加一个显示通知的命令
		this.addCommand({
			id: 'show-message-notification',
			name: '显示测试消息',
			callback: () => {
				new Notice(this.settings.message);
			}
		});

		// 添加设置选项卡
		this.addSettingTab(new SimpleSettingTab(this.app, this));
	}

	onunload() {
		// 清理工作
		this.statusBarItemEl.remove();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SimpleSettingTab extends PluginSettingTab {
	plugin: SimpleTestPlugin;

	constructor(app: App, plugin: SimpleTestPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: '简单测试插件设置'});

		new Setting(containerEl)
			.setName('测试消息')
			.setDesc('设置点击命令时显示的消息')
			.addText(text => text
				.setPlaceholder('输入一条消息')
				.setValue(this.plugin.settings.message)
				.onChange(async (value) => {
					this.plugin.settings.message = value;
					await this.plugin.saveSettings();
				}));
	}
}