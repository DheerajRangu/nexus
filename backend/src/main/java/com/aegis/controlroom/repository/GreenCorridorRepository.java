package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.GreenCorridorSignal;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GreenCorridorRepository extends JpaRepository<GreenCorridorSignal, String> {
}
