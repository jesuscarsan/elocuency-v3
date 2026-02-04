import { TFile, getAllTags } from 'obsidian';
import { Contact } from '../Adapters/ContactAdapter';
import { FrontmatterKeys } from "@elo/core";

export class GoogleContactTransformer {

    // Constant for Google ID in frontmatter - could be moved to Registry later
    static readonly GOOGLE_ID_KEY = "!!googleContactId";
    static readonly GOOGLE_SYNC_DATE_KEY = "!!googleSyncDate";
    static readonly GOOGLE_LAST_MODIFIED_KEY = "!!googleLastModified";

    // Tag Mapping Table: Obsidian Tag -> Google Group Name
    static readonly TAG_MAPPINGS: Record<string, string> = {
        "Personas/Conocidos-mios": "Conocidos",
        "Personas/Compañeros-de-trabajo": "Compañero de trabajo",
        "Personas/Familia": "Familia",
        "Personas/Servicios": "Servicios"
    };

    /**
     * Updates the frontmatter object in-place with data from the Contact.
     * Use this within app.fileManager.processFrontMatter callback.
     */
    updateFrontmatterFromContact(frontmatter: any, contact: Contact): void {
        if (!contact) return;

        // update ID
        if (contact.id) {
            frontmatter[GoogleContactTransformer.GOOGLE_ID_KEY] = contact.id;
        }

        // update Sync Date (Obsidian side)
        frontmatter[GoogleContactTransformer.GOOGLE_SYNC_DATE_KEY] = new Date().toISOString();

        // Populate missing fields
        this.updateFieldIfMissing(frontmatter, FrontmatterKeys.Telefono, contact.phone);
        this.updateFieldIfMissing(frontmatter, FrontmatterKeys.Email, contact.email);
        this.updateFieldIfMissing(frontmatter, FrontmatterKeys.Cumpleanos, contact.birthday);
        this.updateFieldIfMissing(frontmatter, 'aliases', contact.nickname ? [contact.nickname] : undefined);
        this.updateFieldIfMissing(frontmatter, FrontmatterKeys.Puesto, contact.jobTitle);
        this.updateFieldIfMissing(frontmatter, FrontmatterKeys.Empresa, contact.organization);

        this.updateFieldIfMissing(frontmatter, FrontmatterKeys.Direcciones, contact.addresses);
        this.updateFieldIfMissing(frontmatter, FrontmatterKeys.Urls, contact.urls);
        this.updateFieldIfMissing(frontmatter, FrontmatterKeys.Eventos, contact.events);
        this.updateFieldIfMissing(frontmatter, FrontmatterKeys.Relaciones, contact.relations);
        this.updateFieldIfMissing(frontmatter, FrontmatterKeys.Genero, contact.gender);
        this.updateFieldIfMissing(frontmatter, FrontmatterKeys.Ocupaciones, contact.occupations);
        this.updateFieldIfMissing(frontmatter, FrontmatterKeys.Intereses, contact.interests);
        this.updateFieldIfMissing(frontmatter, FrontmatterKeys.Habilidades, contact.skills);
        this.updateFieldIfMissing(frontmatter, FrontmatterKeys.Residencias, contact.residences);


        // Map Dynamic Custom Fields
        if (contact.customFields) {
            for (const [key, value] of Object.entries(contact.customFields)) {
                if (key === 'eloSyncDate') continue; // Handled specially
                // Direct mapping: Google "Key" -> Obsidian "Key"
                this.updateFieldIfMissing(frontmatter, key, value);
            }
        }

        // Map Groups (Google -> Obsidian)
        // Groups are typically NOT stored in frontmatter 'tags' normally, 
        // because Obsidian manages tags via #hashes in content or 'tags' YAML list.
        // We will update 'tags' in frontmatter if we find a match.
        // NOTE: fileManager.processFrontMatter handles 'tags' property as array (or list).
        if (contact.groups) {
            const currentTags = this.getTagsFromFrontmatter(frontmatter);
            const newTags = new Set(currentTags);

            // Reverse Map: Google Group -> Obsidian Tag
            const reverseMap: Record<string, string> = {};
            for (const [obsKey, gName] of Object.entries(GoogleContactTransformer.TAG_MAPPINGS)) {
                reverseMap[gName] = obsKey;
            }

            for (const gName of contact.groups) {
                const mappedTag = reverseMap[gName];
                if (mappedTag) {
                    newTags.add(mappedTag);
                }
            }

            // Only update if changed
            if (newTags.size > currentTags.length) {
                frontmatter['tags'] = Array.from(newTags);
            }
        }
    }

    /**
     * Converts a TFile and its frontmatter to a Contact domain object.
     * Note: Does not read file content for notes, only metadata/frontmatter.
     */
    toContact(file: TFile, frontmatter: any, allFileTags?: string[]): Contact {
        const name = file.basename.replace(/\(.*\)/g, "").trim() || file.basename;
        const finalName = frontmatter?.['name'] || name;

        // Map Tags (Obsidian -> Google)
        // We need all tags from the file (header tags + inline tags). 
        // Usually passed in via getAllTags(cache). If not valid, fallback to frontmatter['tags'].
        const fileTags = allFileTags || this.getTagsFromFrontmatter(frontmatter);
        const contactGroups: string[] = [];

        if (fileTags) {
            for (const tag of fileTags) {
                // Remove '#' prefix if present
                const cleanTag = tag.startsWith('#') ? tag.substring(1) : tag;
                const groupName = GoogleContactTransformer.TAG_MAPPINGS[cleanTag];
                if (groupName) {
                    contactGroups.push(groupName);
                }
            }
        }

        return {
            id: frontmatter[GoogleContactTransformer.GOOGLE_ID_KEY],
            name: this.clean(finalName),
            phone: this.clean(this.toArray(frontmatter[FrontmatterKeys.Telefono])),
            email: this.clean(this.toArray(frontmatter[FrontmatterKeys.Email])),
            birthday: this.clean(frontmatter[FrontmatterKeys.Cumpleanos]),
            nickname: this.getStringFromCleaned(this.clean(frontmatter['aliases'])),
            jobTitle: this.clean(frontmatter[FrontmatterKeys.Puesto]),
            organization: this.clean(frontmatter[FrontmatterKeys.Empresa]),
            customFields: {
                eloSyncDate: new Date().toISOString()
            },
            groups: contactGroups
        };
    }

    private getTagsFromFrontmatter(frontmatter: any): string[] {
        const tags = frontmatter['tags'];
        if (!tags) return [];
        if (Array.isArray(tags)) return tags;
        if (typeof tags === 'string') return tags.split(',').map(t => t.trim());
        return [];
    }


    private clean(val: any): any {
        if (!val) return val;
        if (Array.isArray(val)) {
            // Recurse for arrays
            return val.map(v => this.clean(v));
        }
        if (typeof val === 'string') {
            // Remove [[ and ]] brackets
            return val.replace(/\[\[/g, '').replace(/\]\]/g, '');
        }
        return val;
    }

    private getStringFromCleaned(val: any): string | undefined {
        if (!val) return undefined;
        if (Array.isArray(val)) {
            return val.length > 0 ? String(val[0]) : undefined;
        }
        return String(val);
    }

    private updateFieldIfMissing(frontmatter: any, key: string, value: any) {
        if (!frontmatter[key]) {
            if (Array.isArray(value) && value.length > 0) {
                frontmatter[key] = value;
            } else if (value) {
                frontmatter[key] = value;
            }
        }
    }

    private toArray(val: any): string[] {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        return [val];
    }
}
