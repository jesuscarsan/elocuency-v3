import { RoleRepositoryPort } from "@elo/core";
import { Role } from "@elo/core";

export { Role }; // Re-export for compatibility if needed, but better to migrate consumers to use imports from Domain

export class RolesService {
    constructor(private repository: RoleRepositoryPort) { }

    async loadRoles(): Promise<Role[]> {
        return await this.repository.loadRoles();
    }
}
