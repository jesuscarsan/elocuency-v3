import { describe, it, expect } from 'vitest';
import { FrontmatterKeys, FrontmatterRegistry, setFrontmatterLanguage } from './FrontmatterRegistry';

describe('FrontmatterRegistry Localization', () => {
    it('should default to Spanish keys', () => {
        expect(FrontmatterKeys.Municipio).toBe('Municipio');
        expect(FrontmatterKeys.Pais).toBe('País');
        expect(FrontmatterRegistry['Municipio'].key).toBe('Municipio');
    });

    it('should translate keys to English and rebuild registry', () => {
        setFrontmatterLanguage('en');

        expect(FrontmatterKeys.Municipio).toBe('Municipality');
        expect(FrontmatterKeys.Pais).toBe('Country');

        // Internal keys should remain unchanged
        expect(FrontmatterKeys.EloCommands).toBe('!!commands');

        // The registry should reflect the new keys
        expect(FrontmatterRegistry['Municipality']).toBeDefined();
        expect(FrontmatterRegistry['Municipality'].key).toBe('Municipality');

        expect(FrontmatterRegistry['Municipio']).toBeUndefined();
    });

    it('should translate keys back to Spanish', () => {
        setFrontmatterLanguage('es');

        expect(FrontmatterKeys.Municipio).toBe('Municipio');
        expect(FrontmatterKeys.Pais).toBe('País');

        // Internal keys should remain unchanged
        expect(FrontmatterKeys.EloCommands).toBe('!!commands');

        // The registry should reflect the original Spanish keys
        expect(FrontmatterRegistry['Municipio']).toBeDefined();
        expect(FrontmatterRegistry['Municipio'].key).toBe('Municipio');

        expect(FrontmatterRegistry['Municipality']).toBeUndefined();
    });
});
