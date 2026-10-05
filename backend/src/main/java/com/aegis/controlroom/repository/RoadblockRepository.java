package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.Roadblock;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.Instant;
import java.util.List;

public interface RoadblockRepository extends JpaRepository<Roadblock, String> {
    List<Roadblock> findByExpiresAtAfterAndVerifiedTrue(Instant now);
}
