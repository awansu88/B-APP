import { ROADMAP_VERSION } from '@/src/domain/roadmap';
import {
  BEAD_PLATE_ROWS,
  reconstructBeadPlate,
} from '@/src/domain/roadmap/beadPlate';

/**
 * Milestone 0 scaffolding checks ONLY. Roadmap reconstruction is NOT
 * implemented yet; these tests assert the locked constant and that the
 * reconstruction function is an explicit unimplemented placeholder. They do
 * NOT validate any roadmap logic.
 */
describe('roadmap — Milestone 0 scaffolding (no reconstruction implemented)', () => {
  it('exposes the locked roadmap version', () => {
    expect(ROADMAP_VERSION).toBe('ROADMAP-001');
  });

  it('locks the Bead Plate row constant (layout only)', () => {
    expect(BEAD_PLATE_ROWS).toBe(6);
  });

  it('reconstructBeadPlate is an explicit unimplemented placeholder', () => {
    expect(() => reconstructBeadPlate([])).toThrow(
      'not implemented in Milestone 0',
    );
  });
});
