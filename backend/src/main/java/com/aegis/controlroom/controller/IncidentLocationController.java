package com.aegis.controlroom.controller;

import com.aegis.controlroom.model.IncidentLocation;
import com.aegis.controlroom.repository.IncidentLocationRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/locations")
public class IncidentLocationController {
    private final IncidentLocationRepository locations;

    public IncidentLocationController(IncidentLocationRepository locations) {
        this.locations = locations;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('SUPERVISOR','OPERATOR')")
    public List<IncidentLocation> list() {
        return locations.findAllByOrderByUpdatedAtDesc();
    }
}
