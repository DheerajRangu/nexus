package com.aegis.controlroom.routing;

import com.aegis.controlroom.repository.RoadblockRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class GoogleRoutesProviderTest {
    private static final String ROUTE_RESPONSE = """
            {"routes":[{"distanceMeters":10000,"duration":"600s",
              "polyline":{"encodedPolyline":"_p~iF~ps|U_ulLnnqC_mqNvxq`@"}}]}
            """;

    @Test
    void requestsTrafficAwareRouteAndMapsGooglePolylineToProviderContract() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        RoadblockRepository roadblocks = mock(RoadblockRepository.class);
        when(roadblocks.findByExpiresAtAfterAndVerifiedTrue(any(Instant.class))).thenReturn(List.of());
        server.expect(requestTo("https://routes.googleapis.com/directions/v2:computeRoutes"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Goog-Api-Key", "unit-test-key"))
                .andExpect(header("X-Goog-FieldMask", "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline"))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("TRAFFIC_AWARE")))
                .andRespond(withSuccess(ROUTE_RESPONSE, MediaType.APPLICATION_JSON));

        GoogleRoutesProvider provider = new GoogleRoutesProvider(builder.build(), roadblocks, "unit-test-key", 15);
        GraphRoute route = provider.routeAvoidingBlocks(38.5, -120.2, 43.252, -126.453).orElseThrow();

        assertEquals("GoogleRoutesAPI", route.provider());
        assertFalse(route.simulated());
        assertEquals(10.0, route.distanceKm());
        assertEquals(10.0, route.etaMins());
        assertEquals(3, route.points().size());
        server.verify();
    }

    @Test
    void reusesTheShortLivedRouteCacheForRepeatedCoordinates() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        RoadblockRepository roadblocks = mock(RoadblockRepository.class);
        when(roadblocks.findByExpiresAtAfterAndVerifiedTrue(any(Instant.class))).thenReturn(List.of());
        server.expect(requestTo("https://routes.googleapis.com/directions/v2:computeRoutes"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(ROUTE_RESPONSE, MediaType.APPLICATION_JSON));

        GoogleRoutesProvider provider = new GoogleRoutesProvider(builder.build(), roadblocks, "unit-test-key", 15);
        provider.routeAvoidingBlocks(38.5, -120.2, 43.252, -126.453).orElseThrow();
        provider.routeAvoidingBlocks(38.5, -120.2, 43.252, -126.453).orElseThrow();

        server.verify();
    }
}
