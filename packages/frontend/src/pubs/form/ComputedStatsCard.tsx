import { useEffect, useMemo, useRef, useState } from "react";

import type { ApiError } from "../../api/client";
import {
  computeNpcStats,
  type ComputeNpcStatsResponse,
} from "./computeNpcStats";

interface ComputedStatsCardProps {
  /** The parsed NPC draft object from the form. */
  npc: Record<string, unknown>;
  token: string;
  onUnauthorized: () => void;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

const DEBOUNCE_MS = 250;

export function ComputedStatsCard({
  npc,
  token,
  onUnauthorized,
}: ComputedStatsCardProps) {
  // Scaling inputs — the only fields that require a server round-trip.
  const level = num(npc.level, 1);
  const hpMult = num(npc.hp_multiplier, 1);
  const dmgMult = num(npc.damage_multiplier, 1);
  const expMult = num(npc.exp_multiplier, 1);
  const defMult = num(npc.defense_multiplier, 1);
  // Boss flag drives the [balance] boss multipliers on hp/damage/xp, so the
  // preview must send it or boss NPCs read as non-boss (understated).
  const boss = npc.boss === true;

  const [computed, setComputed] = useState<ComputeNpcStatsResponse | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);

  // Stable key so the effect only re-fires when a scaling input changes.
  const key = useMemo(
    () => `${level}|${hpMult}|${dmgMult}|${expMult}|${defMult}|${boss}`,
    [level, hpMult, dmgMult, expMult, defMult, boss]
  );

  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;

  useEffect(() => {
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await computeNpcStats(
          token,
          {
            level,
            hp_multiplier: hpMult,
            damage_multiplier: dmgMult,
            exp_multiplier: expMult,
            defense_multiplier: defMult,
            boss,
          },
          controller.signal
        );
        setComputed(res);
        setOffline(false);
      } catch (e) {
        if (controller.signal.aborted) return;
        const err = e as ApiError;
        if (err?.status === 401) {
          onUnauthorizedRef.current();
        } else {
          // 502 (reoserv down) or anything else → degrade, don't show stale.
          setOffline(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
    // `key` captures the scaling inputs; token re-auth re-fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, token]);

  // A REOSERV predating the scaling rework returns no survivabilityCurve /
  // armor / evade / accuracy — guard so the card degrades instead of crashing.
  const hasScaledDefense = computed?.survivabilityCurve != null;
  const survCurve = computed?.survivabilityCurve ?? 0;
  // Damage scales on the survivability curve on a current server; fall back to
  // the offense `curve` for the hint on an older server.
  const dmgCurve = computed?.survivabilityCurve ?? computed?.curve ?? 0;

  return (
    <div className="sticky top-0 z-20 mb-4 rounded-md border border-slate-800 bg-slate-900 p-3 shadow-md shadow-slate-950/60">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Effective stats — what a player faces
        </h3>
        {loading && <span className="text-[10px] text-slate-500">computing…</span>}
      </div>

      {offline ? (
        <div className="text-sm text-amber-400">
          Preview unavailable — REOSERV not reachable.
        </div>
      ) : (
        <div className="space-y-1.5">
          <Row
            label="HP"
            value={computed ? String(computed.hp) : "—"}
            hint={
              computed
                ? `${computed.baseHp} × ${computed.curve.toFixed(2)} × ${hpMult}`
                : undefined
            }
          />
          <Row
            label="Damage"
            value={
              computed ? `${computed.damageMin} – ${computed.damageMax}` : "—"
            }
            hint={
              computed
                ? `${computed.baseMinDamage}–${computed.baseMaxDamage} × ${dmgCurve.toFixed(2)} × ${dmgMult}`
                : undefined
            }
          />
          <Row
            label="XP"
            value={computed ? String(computed.xp) : "—"}
            hint={
              computed
                ? `${computed.baseXp} × ${computed.curve.toFixed(2)} × ${expMult}`
                : undefined
            }
          />
          <div className="my-1 border-t border-slate-800" />
          {hasScaledDefense ? (
            <>
              <Row
                label="Accuracy"
                value={String(computed?.accuracy ?? 0)}
                hint={`${computed?.baseAccuracy ?? 0} × ${survCurve.toFixed(2)} × ${defMult}`}
              />
              <Row
                label="Evade"
                value={String(computed?.evade ?? 0)}
                hint={`${computed?.baseEvade ?? 0} × ${survCurve.toFixed(2)} × ${defMult}`}
              />
              <Row
                label="Armor"
                value={String(computed?.armor ?? 0)}
                hint={`${computed?.baseArmor ?? 0} × ${survCurve.toFixed(2)} × ${defMult}`}
              />
            </>
          ) : (
            <p className="text-[10px] leading-snug text-amber-400/80">
              Armor / Evade / Accuracy scaling needs an updated REOSERV (the
              scaling rework). This server didn't return them.
            </p>
          )}
        </div>
      )}

      <p className="mt-2 text-[10px] leading-snug text-slate-500">
        All stats are computed server-side from <code>level</code> + multipliers.
        HP / XP scale on the offense curve; Damage / Armor / Evade / Accuracy on
        the survivability curve (Accuracy / Evade / Armor use{" "}
        <code>defense_multiplier</code>). The pub <code>hp</code>,{" "}
        <code>min_damage</code>, <code>max_damage</code>, <code>experience</code>,{" "}
        <code>armor</code>, <code>evade</code> and <code>accuracy</code> fields
        are all ignored at runtime.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span
        className="font-mono text-slate-100"
        title={hint ? `= ${hint}` : undefined}
      >
        {value}
      </span>
    </div>
  );
}
