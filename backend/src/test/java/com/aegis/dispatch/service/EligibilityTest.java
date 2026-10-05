package com.aegis.dispatch.service;

import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;

class EligibilityTest {
  private final Instant now=Instant.parse("2026-10-06T00:00:00Z");
  private final Eligibility.Requirement trauma=new Eligibility.Requirement(Set.of("TRAUMA_KIT","VENTILATOR"),Set.of("ALS","TRAUMA"),2);
  @Test void closerBasicVehicleIsExcludedBeforeEtaRanking(){
    var basic=new Eligibility.Vehicle("AVAILABLE",true,true,true,true,false,1,Set.of("BASIC_LIFE_SUPPORT"),Set.of("BLS"),now);
    var reasons=Eligibility.exclusions(basic,trauma,now,Duration.ofSeconds(90));
    assertTrue(reasons.stream().anyMatch(x->x.contains("Missing equipment")));assertTrue(reasons.stream().anyMatch(x->x.contains("Insufficient")));
  }
  @Test void advancedReadyVehicleIsEligible(){
    var advanced=new Eligibility.Vehicle("AVAILABLE",true,true,true,true,false,2,Set.of("TRAUMA_KIT","VENTILATOR"),Set.of("ALS","TRAUMA"),now);
    assertTrue(Eligibility.exclusions(advanced,trauma,now,Duration.ofSeconds(90)).isEmpty());
  }
  @Test void busyAndStaleVehiclesAreExcluded(){
    var busy=new Eligibility.Vehicle("BUSY",true,true,true,true,false,2,trauma.equipment(),trauma.crew(),now.minusSeconds(120));
    var reasons=Eligibility.exclusions(busy,trauma,now,Duration.ofSeconds(90));
    assertTrue(reasons.stream().anyMatch(x->x.contains("busy")));assertTrue(reasons.stream().anyMatch(x->x.contains("stale")));
  }
}
