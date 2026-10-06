package com.aegis.controlroom.controller;

import com.aegis.controlroom.dto.InboundCallWebhookDto;
import com.aegis.controlroom.model.EmergencyCase;
import com.aegis.controlroom.service.IntakeService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

class DemoIntakeControllerTest {
    @Test
    void simulatedCallUsesServerSideDemoIdempotencyKey() {
        IntakeService intake = mock(IntakeService.class);
        EmergencyCase expected = new EmergencyCase();
        when(intake.processWebhookIntake(any(), eq("demo-call-42"))).thenReturn(expected);
        DemoIntakeController controller = new DemoIntakeController(intake);
        InboundCallWebhookDto request = new InboundCallWebhookDto();
        request.setExternalCallRef("call-42");

        var response = controller.simulateInboundCall(request);

        assertEquals(HttpStatus.ACCEPTED, response.getStatusCode());
        assertEquals(expected, response.getBody());
        verify(intake).processWebhookIntake(request, "demo-call-42");
    }
}
