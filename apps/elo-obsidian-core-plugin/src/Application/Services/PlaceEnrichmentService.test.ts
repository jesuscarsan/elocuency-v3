import { PlaceEnrichmentService } from './PlaceEnrichmentService';
import { GeocodingPort, GeocodingResponse } from "@elo/core";
import { LlmPort } from "@elo/core";
import { PlaceTypes } from "@elo/core";
// import { describe, it, expect, beforeEach, jest } from '@jest/globals'; // Assuming jest is global or strictly imported

describe('PlaceEnrichmentService', () => {
    let service: PlaceEnrichmentService;
    let mockGeocoder: any;
    let mockLlm: any;

    beforeEach(() => {
        mockGeocoder = {
            requestPlaceDetails: jest.fn(),
        };
        mockLlm = {
            requestJson: jest.fn(),
            requestEnrichment: jest.fn(),
            requestStreamBrief: jest.fn(),
            request: jest.fn(),
        };
        service = new PlaceEnrichmentService(mockGeocoder, mockLlm);
    });

    it('should include tag rules in prompt when excludeTags is false', async () => {
        const placeName = 'Test Place';
        mockGeocoder.requestPlaceDetails.mockResolvedValue({} as GeocodingResponse);
        mockLlm.requestJson.mockResolvedValue({});

        await service.enrichPlace(placeName, undefined, undefined, undefined, false);

        expect(mockLlm.requestJson).toHaveBeenCalled();
        const callArgs = mockLlm.requestJson.mock.calls[0][0];
        expect(callArgs.prompt).toContain('Rules for tags:');
        expect(callArgs.prompt).toContain('ONLY use tags from this list');
    });

    it('should NOT include tag rules in prompt when excludeTags is true', async () => {
        const placeName = 'Test Place';
        mockGeocoder.requestPlaceDetails.mockResolvedValue({} as GeocodingResponse);
        mockLlm.requestJson.mockResolvedValue({});

        await service.enrichPlace(placeName, undefined, undefined, undefined, true);

        expect(mockLlm.requestJson).toHaveBeenCalled();
        const callArgs = mockLlm.requestJson.mock.calls[0][0];
        expect(callArgs.prompt).not.toContain('Rules for tags:');
        expect(callArgs.prompt).not.toContain('ONLY use tags from this list');
    });
});
