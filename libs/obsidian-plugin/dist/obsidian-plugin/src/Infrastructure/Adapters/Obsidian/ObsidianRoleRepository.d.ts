import { App } from 'obsidian';
import { RoleRepositoryPort } from "@elo/core";
import { SettingsPort } from "@elo/core";
import { Role } from "@elo/core";
export declare class ObsidianRoleRepository implements RoleRepositoryPort {
    private app;
    private settings;
    constructor(app: App, settings: SettingsPort);
    loadRoles(): Promise<Role[]>;
}
