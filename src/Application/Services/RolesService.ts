import { RoleRepositoryPort } from '../../Domain/Ports/RoleRepositoryPort';
import { Role } from '../../Domain/Types/Role';

export { Role }; // Re-export for compatibility if needed, but better to migrate consumers to use imports from Domain

export class RolesService {
    constructor(private repository: RoleRepositoryPort) { }

    async loadRoles(): Promise<Role[]> {
        return await this.repository.loadRoles();
    }
}
