package com.aegis.dispatch.api;

import com.aegis.dispatch.api.ApiModels.TelemetryUpload;
import com.aegis.dispatch.api.ApiModels.OperationalProblemRequest;
import com.aegis.dispatch.api.ApiModels.PushTokenRequest;
import com.aegis.dispatch.service.DispatchService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/driver")
public class DriverController {
  private final DispatchService dispatch; public DriverController(DispatchService dispatch){this.dispatch=dispatch;}
  @GetMapping("/me/snapshot") public Map<String,Object> snapshot(Authentication auth){return dispatch.driverSnapshot(auth.getName());}
  @PostMapping("/telemetry") public Map<String,Object> telemetry(@Valid @RequestBody TelemetryUpload request,Authentication auth){dispatch.telemetry(request,auth.getName());return Map.of("accepted",true,"serverTime",java.time.Instant.now().toString());}
  @PostMapping("/assignments/{assignmentId}/receipt") public Map<String,Object> receipt(@PathVariable UUID assignmentId,Authentication auth){dispatch.receipt(assignmentId,auth.getName());return Map.of("accepted",true);}
  @PostMapping("/assignments/{assignmentId}/acknowledgement") public Map<String,Object> acknowledge(@PathVariable UUID assignmentId,Authentication auth){dispatch.acknowledge(assignmentId,auth.getName());return Map.of("accepted",true,"state","EN_ROUTE_TO_PATIENT");}
  @PostMapping("/assignments/{assignmentId}/pickup-change-acknowledgement") public Map<String,Object> pickupChangeAcknowledgement(@PathVariable UUID assignmentId,Authentication auth){dispatch.pickupChangeAcknowledged(assignmentId,auth.getName());return Map.of("accepted",true);}
  @PostMapping("/assignments/{assignmentId}/arrival") public Map<String,Object> arrival(@PathVariable UUID assignmentId,Authentication auth){dispatch.arrive(assignmentId,auth.getName());return Map.of("accepted",true,"state","AT_PATIENT");}
  @PostMapping("/assignments/{assignmentId}/operational-problems") public Map<String,Object> operationalProblem(@PathVariable UUID assignmentId,@Valid @RequestBody OperationalProblemRequest request,Authentication auth){dispatch.operationalProblem(assignmentId,request.category(),request.detail(),auth.getName());return Map.of("accepted",true,"controlRoomAlerted",true);}
  @PostMapping("/push-tokens") public Map<String,Object> pushToken(@Valid @RequestBody PushTokenRequest request,Authentication auth){dispatch.registerPushToken(request.token(),request.platform(),auth.getName());return Map.of("accepted",true);}
  @DeleteMapping("/push-tokens/{token}") public void removePushToken(@PathVariable String token,Authentication auth){dispatch.removePushToken(token,auth.getName());}
}
