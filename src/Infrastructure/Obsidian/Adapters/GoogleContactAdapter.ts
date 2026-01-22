
import { Contact, ContactAdapter } from "./ContactAdapter";
import { UnresolvedLinkGeneratorSettings } from "../settings";
import { Notice, requestUrl, RequestUrlParam } from "obsidian";

export class GoogleContactAdapter implements ContactAdapter {
    private settings: UnresolvedLinkGeneratorSettings;
    private saveSettings: (settings: UnresolvedLinkGeneratorSettings) => Promise<void>;

    constructor(
        settings: UnresolvedLinkGeneratorSettings,
        saveSettings: (settings: UnresolvedLinkGeneratorSettings) => Promise<void>
    ) {
        this.settings = settings;
        this.saveSettings = saveSettings;
    }

    generateAuthUrl(redirectUri: string): string {
        if (!this.settings.googleClientId) {
            console.error("Google Client ID is missing.");
            return "";
        }

        const scope = "https://www.googleapis.com/auth/contacts";
        const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${this.settings.googleClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;

        return url;
    }

    async finishAuthentication(code: string, redirectUri: string): Promise<boolean> {
        if (!this.settings.googleClientId || !this.settings.googleClientSecret) {
            throw new Error("Missing Client ID or Secret in settings.");
        }

        try {
            const response = await requestUrl({
                url: "https://oauth2.googleapis.com/token",
                method: "POST",
                throw: false,
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: this.settings.googleClientId,
                    client_secret: this.settings.googleClientSecret,
                    code: code,
                    grant_type: "authorization_code",
                    redirect_uri: redirectUri
                }).toString(),
            });

            if (response.status !== 200) {
                console.error("[GoogleAdapter] Token Exchange Failed. Status:", response.status);
                throw new Error(`Failed to exchange token: ${response.text}`);
            }

            const data = response.json;
            if (!data.access_token) {
                throw new Error("No access_token in response");
            }

            this.settings.googleAccessToken = data.access_token;
            // expires_in is usually 3600 seconds
            const now = Date.now();
            this.settings.googleTokenExpirationTime = now + (data.expires_in * 1000);

            if (data.refresh_token) {
                this.settings.googleRefreshToken = data.refresh_token;
            }

            await this.saveSettings(this.settings);
            console.log("[GoogleAdapter] Authentication Successful");
            return true;

        } catch (error) {
            console.error("[GoogleAdapter] Auth Error", error);
            throw error;
        }
    }

    private async getAccessToken(): Promise<string> {
        // Check if we have tokens at all
        if (!this.settings.googleRefreshToken && !this.settings.googleAccessToken) {
            throw new Error("No Google tokens found. Please authenticate first.");
        }

        const now = Date.now();
        // Add 5 minute buffer
        if (this.settings.googleAccessToken && this.settings.googleTokenExpirationTime > now + 300000) {
            return this.settings.googleAccessToken;
        }

        if (!this.settings.googleRefreshToken) {
            throw new Error("Google Refresh Token is missing. Re-authentication required.");
        }

        console.log("[GoogleAdapter] Refreshing Access Token...");

        try {
            const response = await requestUrl({
                url: "https://oauth2.googleapis.com/token",
                method: "POST",
                throw: false,
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: this.settings.googleClientId,
                    client_secret: this.settings.googleClientSecret,
                    refresh_token: this.settings.googleRefreshToken,
                    grant_type: "refresh_token",
                }).toString(),
            });

            if (response.status !== 200) {
                console.error("[GoogleAdapter] Token Refresh Failed. Status:", response.status);
                console.error("[GoogleAdapter] Response Body:", response.text);
                throw new Error(`Failed to refresh token: ${response.status} - ${response.text}`);
            }

            const data = response.json;
            if (!data.access_token) {
                throw new Error("No access_token in response");
            }

            this.settings.googleAccessToken = data.access_token;
            // expires_in is usually 3600 seconds
            this.settings.googleTokenExpirationTime = now + (data.expires_in * 1000);

            await this.saveSettings(this.settings);
            console.log("[GoogleAdapter] Token Refreshed Successfully");
            return this.settings.googleAccessToken;

        } catch (error) {
            console.error("[GoogleAdapter] Auth Error", error);
            new Notice("Error al autenticar con Google. Revisa la consola.");
            throw error;
        }
    }

    private async request(url: string, method: string = "GET", body?: any): Promise<any> {
        const token = await this.getAccessToken();
        const params: RequestUrlParam = {
            url,
            method,
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        };

        if (body) {
            params.body = JSON.stringify(body);
        }

        const response = await requestUrl(params);

        if (response.status >= 400) {
            throw new Error(`Google API Error ${response.status}: ${response.text}`);
        }

        return response.json;
    }

    async searchContacts(query: string): Promise<Contact[]> {
        // People API: people.searchContacts
        // Note: query requires at least 3 chars usually
        if (query.length < 1) return [];

        const url = `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(query)}&readMask=names,phoneNumbers,emailAddresses,birthdays,userDefined`;

        try {
            const data = await this.request(url);
            if (!data.results) return [];

            return data.results.map((item: any) => this.mapToContact(item.person));
        } catch (e) {
            console.error("[GoogleAdapter] Search Error", e);
            throw e;
        }
    }

    async upsertContact(contact: Contact): Promise<Contact> {
        if (contact.id) {
            return this.updateContact(contact.id, contact);
        } else {
            return this.createContact(contact);
        }
    }

    private async createContact(contact: Contact): Promise<Contact> {
        const url = `https://people.googleapis.com/v1/people:createContact`;
        const body = this.mapToGooglePayload(contact);

        const data = await this.request(url, "POST", body);
        return this.mapToContact(data);
    }

    private async updateContact(resourceName: string, contact: Contact): Promise<Contact> {
        // 1. Get current etag and data to merge properly? 
        // Or strictly overwrite? API documentation says update requires fields mask.
        // And usually we need the etag.

        // Fetch current person to get etag
        const getUrl = `https://people.googleapis.com/v1/${resourceName}?personFields=names,phoneNumbers,emailAddresses,birthdays,userDefined`;
        const current = await this.request(getUrl);

        const etag = current.etag;

        // Prepare update
        const body = this.mapToGooglePayload(contact);
        body.etag = etag; // Critical for update

        // We need to specify which fields to update.
        // Simplification: Update what we have.
        const updateMask = [];
        if (contact.name) updateMask.push("names");
        if (contact.phone) updateMask.push("phoneNumbers");
        if (contact.email) updateMask.push("emailAddresses");
        if (contact.birthday) updateMask.push("birthdays");
        if (contact.customFields) updateMask.push("userDefined");

        const updateUrl = `https://people.googleapis.com/v1/${resourceName}:updateContact?updatePersonFields=${updateMask.join(",")}`;

        const data = await this.request(updateUrl, "PATCH", body);
        return this.mapToContact(data);
    }


    async listContacts(pageSize: number, pageToken?: string): Promise<{ contacts: Contact[], nextSyncToken?: string, nextPageToken?: string }> {
        let url = `https://people.googleapis.com/v1/people/me/connections?personFields=names,phoneNumbers,emailAddresses,birthdays,userDefined&pageSize=${pageSize}`;
        if (pageToken) {
            url += `&pageToken=${pageToken}`;
        }

        const data = await this.request(url);

        return {
            contacts: (data.connections || []).map((p: any) => this.mapToContact(p)),
            nextSyncToken: data.nextSyncToken,
            nextPageToken: data.nextPageToken
        };
    }

    async deleteContact(resourceName: string): Promise<void> {
        const url = `https://people.googleapis.com/v1/${resourceName}:deleteContact`;
        await this.request(url, "DELETE");
    }

    private mapToContact(person: any): Contact {
        const names = person.names || [];
        const phones = person.phoneNumbers || [];
        const emails = person.emailAddresses || [];
        const birthdays = person.birthdays || [];
        const userDefined = person.userDefined || [];

        const primaryName = names.find((n: any) => n.metadata?.primary) || names[0];

        // Birthday parse
        let bdayStr = undefined;
        if (birthdays.length > 0) {
            const b = birthdays[0].date;
            if (b.year && b.month && b.day) {
                bdayStr = `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
            }
        }

        return {
            id: person.resourceName,
            name: primaryName ? primaryName.displayName : "No Name",
            phone: phones.map((p: any) => p.value),
            birthday: bdayStr,
            customFields: userDefined.reduce((acc: any, curr: any) => {
                acc[curr.key] = curr.value;
                return acc;
            }, {})
        };
    }

    private mapToGooglePayload(contact: Contact): any {
        const payload: any = {};

        if (contact.name) {
            // Split name simplistic
            const parts = contact.name.split(" ");
            const given = parts[0];
            const family = parts.slice(1).join(" ");
            payload.names = [{
                givenName: given,
                familyName: family
            }];
        }

        if (contact.phone && contact.phone.length > 0) {
            payload.phoneNumbers = contact.phone.map(p => ({ value: p }));
        }

        if (contact.email && contact.email.length > 0) {
            payload.emailAddresses = contact.email.map(e => ({ value: e }));
        }

        if (contact.birthday) {
            // Expect YYYY-MM-DD
            const [y, m, d] = contact.birthday.split("-").map(Number);
            if (y && m && d) {
                payload.birthdays = [{
                    date: {
                        year: y,
                        month: m,
                        day: d
                    }
                }];
            }
        }

        if (contact.customFields) {
            payload.userDefined = Object.entries(contact.customFields).map(([key, value]) => ({
                key: key,
                value: value
            }));
        }

        return payload;
    }
}
