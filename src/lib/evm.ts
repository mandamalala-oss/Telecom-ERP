export interface DerivedEVM {
  cpi: number;  // EV / AC
  spi: number;  // EV / PV
  sv: number;   // EV - PV
  cv: number;   // EV - AC
  eac: number;  // BAC / CPI
  etc: number;  // EAC - AC
  vac: number;  // BAC - EAC
  tcpi: number; // (BAC - EV) / (BAC - AC)
}

/**
 * Derive the standard EVM metrics from the four base inputs. Pure and
 * unit-tested: the EVM form stores only BAC / PV / EV / AC (plus
 * percentComplete) and everything else is computed on save.
 * Division-by-zero guards return 0 (no meaningful value yet).
 */
export function deriveEVM(bac: number, pv: number, ev: number, ac: number): DerivedEVM {
  const cpi = ac > 0 ? ev / ac : 0
  const spi = pv > 0 ? ev / pv : 0
  const sv = ev - pv
  const cv = ev - ac
  const eac = cpi > 0 ? bac / cpi : 0
  const etc = eac - ac
  const vac = bac - eac
  const remainingBudget = bac - ac
  const tcpi = remainingBudget !== 0 ? (bac - ev) / remainingBudget : 0
  return { cpi, spi, sv, cv, eac, etc, vac, tcpi }
}
