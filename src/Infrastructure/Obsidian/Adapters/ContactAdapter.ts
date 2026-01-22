
export interface Contact {
    id?: string; // Resource Name for Google, UUID for Mac
    name: string;
    phone?: string[];
    email?: string[];
    birthday?: string; // YYYY-MM-DD
    customFields?: Record<string, string>;
}

export interface ContactAdapter {
    searchContacts(query: string): Promise<Contact[]>;
    upsertContact(contact: Contact): Promise<Contact>;
    listContacts(pageSize: number, pageToken?: string): Promise<{ contacts: Contact[], nextSyncToken?: string, nextPageToken?: string }>;
    deleteContact(resourceName: string): Promise<void>;
}
