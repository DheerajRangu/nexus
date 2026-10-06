package com.aegis.dispatch.api;

import com.aegis.dispatch.api.ApiModels.FailureRequest;
import com.aegis.dispatch.service.DispatchService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/demo")
public class DemoController {
  private final DispatchService dispatch; public DemoController(DispatchService dispatch){this.dispatch=dispatch;}
  @PostMapping("/reset") public Map<String,Object> reset(Authentication auth){dispatch.resetDemo(auth.getName(),"OPERATOR");return dispatch.snapshot("EM-2026-001");}
  @PostMapping("/emergencies/{emergencyId}/failures") public Map<String,Object> failure(@PathVariable String emergencyId,@Valid @RequestBody FailureRequest request){dispatch.failure(request.mode());return dispatch.snapshot(emergencyId);}
}
