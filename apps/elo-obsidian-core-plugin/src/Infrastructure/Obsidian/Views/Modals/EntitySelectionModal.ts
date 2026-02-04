import { App, Modal, Setting } from 'obsidian';

export interface Entity {
    name: string;
    type: 'Person' | 'Place' | 'Concept';
    relevance: 'High' | 'Medium' | 'Low';
}

export class EntitySelectionModal extends Modal {
    private selectedEntities: Set<Entity>;

    constructor(
        app: App,
        private entities: Entity[],
        private onConfirm: (selected: Entity[]) => void
    ) {
        super(app);
        this.selectedEntities = new Set(entities.filter(e => e.relevance === 'High'));
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: 'Review Entities to Link' });

        this.entities.forEach(entity => {
            new Setting(contentEl)
                .setName(`${entity.name} (${entity.type})`)
                .setDesc(`Relevance: ${entity.relevance}`)
                .addToggle(toggle => toggle
                    .setValue(entity.relevance === 'High')
                    .onChange(value => {
                        if (value) {
                            this.selectedEntities.add(entity);
                        } else {
                            this.selectedEntities.delete(entity);
                        }
                    }));
        });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Process Selected')
                .setCta()
                .onClick(() => {
                    this.close();
                    this.onConfirm(Array.from(this.selectedEntities));
                }))
            .addButton(btn => btn
                .setButtonText('Cancel')
                .onClick(() => {
                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
