export const TagFolderMappingRegistry: Record<string, string> = {};

export function setTagFolderMapping(mapping: Record<string, string>) {
    for (const key of Object.keys(TagFolderMappingRegistry)) {
        delete TagFolderMappingRegistry[key];
    }
    Object.assign(TagFolderMappingRegistry, mapping);
}
