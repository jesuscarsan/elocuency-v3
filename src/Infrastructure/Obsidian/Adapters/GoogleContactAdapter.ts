
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
        // Ensure groups are loaded
        await this.ensureContactGroupsLoaded();

        // People API: people.searchContacts
        if (query.length < 1) return [];

        const url = `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(query)}&readMask=names,phoneNumbers,emailAddresses,birthdays,biographies,userDefined,metadata,nicknames,organizations,addresses,urls,events,relations,genders,occupations,interests,skills,residences,memberships`;

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
        await this.ensureContactGroupsLoaded();
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
        // Fetch current person to get etag and memberships
        const getUrl = `https://people.googleapis.com/v1/${resourceName}?personFields=names,phoneNumbers,emailAddresses,birthdays,userDefined,nicknames,organizations,addresses,urls,events,relations,genders,occupations,interests,skills,residences,memberships`;
        const current = await this.request(getUrl);

        const etag = current.etag;

        // Prepare update
        const body = this.mapToGooglePayload(contact);
        body.etag = etag; // Critical for update

        const updateMask = [];
        if (contact.name) updateMask.push("names");
        if (contact.phone) updateMask.push("phoneNumbers");
        if (contact.email) updateMask.push("emailAddresses");
        if (contact.birthday) updateMask.push("birthdays");
        if (contact.customFields) updateMask.push("userDefined");
        if (contact.nickname) updateMask.push("nicknames");
        if (contact.jobTitle || contact.organization) updateMask.push("organizations");

        // Handle Groups / Memberships
        if (contact.groups) {
            updateMask.push("memberships");
            // Merge with existing memberships to avoid removing system groups only if we are modifying user groups
            // We need to construct the full membership list.
            // Strategy:
            // 1. Get current memberships.
            // 2. Identify system groups (keep them).
            // 3. Identify mapped groups (Obsidian synced groups).
            // 4. Re-build list with contact.groups (mapped) + existing system groups.

            const currentMemberships = current.memberships || [];
            const targetGroupNames = new Set(contact.groups);

            // Existing System Groups check (e.g. 'contactGroups/myContacts')
            // We want to KEEP groups that are NOT in our "managed" set? 
            // Or simpler: We resolve contact.groups to IDs.
            // Any existing membership that is NOT one of our targeted IDs, we keep?
            // But we don't know which IDs are "Obsidian Managed" unless we check all groups.
            // Simpler approach:
            // - Resolve target names to IDs.
            // - Keep all system groups (ID maps to 'System Group' or similar? No, API returns metadata).
            // - Actually, we can just keep any membership that is NOT in the list of "All Known User Label IDs" we have?
            // - For now, let's keep it simple: Add new ones, remove ones that are managed but not in target.

            // Better: Just send the new list. 
            // BUT, we must preserve 'contactGroups/myContacts' to keep it in "Contacts" list.
            const systemGroupIds = ["contactGroups/myContacts", "contactGroups/starred"]; // Common ones

            const newMemberships = [];

            // Add Target Groups
            for (const gName of contact.groups) {
                const gId = this.contactGroupNamesToIds.get(gName);
                if (gId) {
                    newMemberships.push({
                        contactGroupMembership: {
                            contactGroupResourceName: gId
                        }
                    });
                }
            }

            // Keep existing "system" or unmanaged groups?
            // If we just replace 'memberships', we lose others. 
            // Let's keep those that seem to be system groups or not in our map.
            for (const m of currentMemberships) {
                const id = m.contactGroupMembership?.contactGroupResourceName;
                const mappedName = this.contactGroupIdsToNames.get(id);

                // If it is NOT a name we know (so it's a system one or unknown), OR it is 'myContacts'/'starred' explicitly
                // Actually, 'myContacts' might be mapped if we fetched it.
                // Let's assume we ONLY touch groups that are in our "Tag Mapping". 
                // But here we rely on the generic 'groups' list.
                // Safety: Keep 'contactGroups/myContacts' always if not present.

                // If ID is not in our loaded "User Labels", keep it.
                // How to distinguish? API Group response has groupType: 'USER_CONTACT_GROUP' vs 'SYSTEM_CONTACT_GROUP'.
                // We need to know that.

                // Fallback: If we don't know the name, keep it.
                if (!mappedName) {
                    // Check if already in new (duplicate)?
                    const exists = newMemberships.find(nm => nm.contactGroupMembership.contactGroupResourceName === id);
                    if (!exists) newMemberships.push(m);
                } else {
                    // It IS a known user label.
                    // If it is NOT in target list (contact.groups), we effectively remove it by not adding it.
                }
            }

            // Ensure MyContacts is there if it was there or if we are creating?
            // Actually, usually we want contacts to be in 'myContacts'.
            // If creating, we add it. If updating, we keep it if present.

            body.memberships = newMemberships;
        }

        const updateUrl = `https://people.googleapis.com/v1/${resourceName}:updateContact?updatePersonFields=${updateMask.join(",")}&personFields=names,phoneNumbers,emailAddresses,birthdays,biographies,userDefined,metadata,nicknames,organizations,addresses,urls,events,relations,genders,occupations,interests,skills,residences,memberships`;

        const data = await this.request(updateUrl, "PATCH", body);
        return this.mapToContact(data);
    }


    async listContacts(pageSize: number, pageToken?: string): Promise<{ contacts: Contact[], nextSyncToken?: string, nextPageToken?: string }> {
        // Ensure groups are loaded
        await this.ensureContactGroupsLoaded();

        let url = `https://people.googleapis.com/v1/people/me/connections?personFields=names,phoneNumbers,emailAddresses,birthdays,biographies,userDefined,metadata,nicknames,organizations,addresses,urls,events,relations,genders,occupations,interests,skills,residences,memberships&pageSize=${pageSize}`;
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

    // --- Groups / Labels Support ---
    private contactGroupIdsToNames: Map<string, string> = new Map();
    private contactGroupNamesToIds: Map<string, string> = new Map();
    private groupsLoaded = false;

    private async ensureContactGroupsLoaded() {
        if (this.groupsLoaded) return;
        try {
            console.log("[GoogleAdapter] Loading Contact Groups...");
            const url = `https://people.googleapis.com/v1/contactGroups`;
            const data = await this.request(url);

            if (data.contactGroups) {
                for (const g of data.contactGroups) {
                    // We prefer formattedName (localized) or name? 
                    // 'formattedName' is "Contacts", "Family" etc. 
                    // 'name' is resource name 'contactGroups/...'
                    // 'params' like name usually have the raw name.
                    // For System groups, formattedName is valid.
                    // For User groups, formattedName is the label.
                    const name = g.formattedName || g.name;
                    const id = g.resourceName;

                    this.contactGroupIdsToNames.set(id, name);
                    // Handle duplicates? Labels should be unique?
                    this.contactGroupNamesToIds.set(name, id);

                    // Also store Spanish translations if predictable? 
                    // No, reliance on what API returns.
                    // But user provided Spanish names: "Familia", "Conocidos".
                    // If the user created them in Google Contacts web UI, they should match.
                }
            }
            this.groupsLoaded = true;
            console.log(`[GoogleAdapter] Loaded ${this.contactGroupIdsToNames.size} groups.`);
        } catch (e) {
            console.error("[GoogleAdapter] Error loading groups", e);
            // Don't fail everything, just proceed with empty
        }
    }

    private mapToContact(person: any): Contact {
        const names = person.names || [];
        const phones = person.phoneNumbers || [];
        const emails = person.emailAddresses || [];
        const birthdays = person.birthdays || [];
        const biographies = person.biographies || [];
        const userDefined = person.userDefined || [];
        const nicknames = person.nicknames || [];
        const organizations = person.organizations || [];
        const addresses = person.addresses || [];
        const urls = person.urls || [];
        const events = person.events || [];
        const relations = person.relations || [];
        const genders = person.genders || [];
        const occupations = person.occupations || [];
        const interests = person.interests || [];
        const skills = person.skills || [];
        const residences = person.residences || [];
        const memberships = person.memberships || []; // Array

        const primaryName = names.find((n: any) => n.metadata?.primary) || names[0];

        // Birthday parse
        let bdayStr = undefined;
        if (birthdays.length > 0) {
            const b = birthdays[0].date;
            if (b.year && b.month && b.day) {
                bdayStr = `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
            }
        }

        // Updated At (from metadata source)
        let updatedAt = undefined;
        if (person.metadata && person.metadata.sources && person.metadata.sources.length > 0) {
            updatedAt = person.metadata.sources.find((s: any) => s.type === "CONTACT")?.updateTime || person.metadata.sources[0].updateTime;
        }

        // Map Groups
        const groups = memberships.map((m: any) => {
            const id = m.contactGroupMembership?.contactGroupResourceName;
            return this.contactGroupIdsToNames.get(id);
        }).filter(Boolean);

        return {
            id: person.resourceName,
            name: primaryName ? primaryName.displayName : "No Name",
            phone: phones.map((p: any) => p.value),
            email: emails.map((e: any) => e.value),
            birthday: bdayStr,
            updatedAt: updatedAt,
            notes: biographies.find((b: any) => b.contentType === "TEXT_PLAIN")?.value,
            nickname: nicknames[0]?.value,
            jobTitle: organizations[0]?.title,
            organization: organizations[0]?.name,
            addresses: addresses.map((a: any) => a.formattedValue),
            urls: urls.map((u: any) => u.value),
            events: events.map((e: any) => {
                if (e.date && e.type) {
                    const d = e.date;
                    const dateStr = `${d.year || '????'}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
                    return `${e.type}: ${dateStr}`;
                }
                return null;
            }).filter(Boolean),
            relations: relations.map((r: any) => `${r.person} (${r.type})`),
            gender: genders[0]?.value,
            occupations: occupations.map((o: any) => o.value),
            interests: interests.map((i: any) => i.value),
            skills: skills.map((s: any) => s.value),
            residences: residences.map((r: any) => r.value),
            customFields: userDefined.reduce((acc: any, curr: any) => {
                acc[curr.key] = curr.value;
                return acc;
            }, {}),
            groups: groups
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

        if (contact.nickname) {
            payload.nicknames = [{
                value: contact.nickname
            }];
        }

        if (contact.jobTitle || contact.organization) {
            const org: any = {};
            if (contact.jobTitle) org.title = contact.jobTitle;
            if (contact.organization) org.name = contact.organization;
            payload.organizations = [org];
        }

        if (contact.customFields) {
            payload.userDefined = Object.entries(contact.customFields).map(([key, value]) => ({
                key: key,
                value: value
            }));
        }

        // Note: Memberships are handled in update/create methods as they require lookups or merging
        // But for CREATE, we can populate them if we know the IDs
        if (contact.groups) {
            const mShips = [];
            for (const gName of contact.groups) {
                const gId = this.contactGroupNamesToIds.get(gName);
                if (gId) {
                    mShips.push({
                        contactGroupMembership: {
                            contactGroupResourceName: gId
                        }
                    });
                }
            }
            // Ensure 'myContacts' if possible?
            // Usually useful.
            if (this.contactGroupNamesToIds.has("Contacts")) {
                // Check if added
            }

            if (mShips.length > 0) payload.memberships = mShips;
        }

        return payload;
    }
}
