package com.aegis.dispatch.api;

import com.aegis.dispatch.api.ApiModels.*;
import com.aegis.dispatch.service.DispatchService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/control-room")
public class ControlRoomController {
  private final DispatchService dispatch; public ControlRoomController(DispatchService dispatch){this.dispatch=dispatch;}
  @GetMapping("/emergencies/{emergencyId}") public Map<String,Object> snapshot(@PathVariable String emergencyId){return dispatch.snapshot(emergencyId);}
  @PostMapping("/emergencies/{emergencyId}/dispatch") public Map<String,Object> directDispatch(@PathVariable String emergencyId,@Valid @RequestBody DispatchRequest request,Authentication auth){return dispatch.dispatch(emergencyId,request,auth.getName(),role(auth));}
  @PostMapping("/emergencies/{emergencyId}/reassign") public Map<String,Object> reassign(@PathVariable String emergencyId,@Valid @RequestBody ReassignRequest request,Authentication auth){return dispatch.reassign(emergencyId,request,auth.getName(),role(auth));}
  @PostMapping("/emergencies/{emergencyId}/pickup-corrections") public Map<String,Object> correctPickup(@PathVariable String emergencyId,@Valid @RequestBody PickupCorrectionRequest request,Authentication auth){return dispatch.correctPickup(emergencyId,request,auth.getName(),role(auth));}
  private String role(Authentication auth){return auth.getAuthorities().stream().findFirst().map(a->a.getAuthority().replace("ROLE_","")).orElse("UNKNOWN");}
}
