import { MODULE } from "./constants.mjs";
import { FILTER } from "./filters.mjs";

function _bonusToInt(bonus, data) {
  const f = new Roll(bonus, data).formula;
  if (!Roll.validate(f)) return 0;
  return Roll.safeEval(f);
}

export function _preDisplayCard(item, chatData) {
  // get bonus:
  const bonuses = FILTER.itemCheck(item, "save", { spellLevel: item.system.level });
  if (!bonuses.length) return;
  const data = item.getRollData();
  const target = game.user.targets.first();
  if (target?.actor) data.target = target.actor.getRollData();
  const totalBonus = bonuses.reduce((acc, bab) => {
    return acc + _bonusToInt(bab.bonuses.bonus, data);
  }, 0);

  // get all buttons.
  const DIV = document.createElement("DIV");
  DIV.innerHTML = chatData.content;
  const saveButtons = DIV.querySelectorAll("button[data-action='save']");

  // create label (innertext)
  const save = item.system.save;
  const ability = CONFIG.DND5E.abilities[save.ability] ?? "";
  const savingThrow = game.i18n.localize("DND5E.ActionSave");
  const dc = Math.max(1, save.dc + totalBonus) || "";
  chatData.flags[MODULE] = { saveDC: dc };
  const label = game.i18n.format("DND5E.SaveDC", { dc, ability });
  saveButtons.forEach(b => b.innerText = `${savingThrow} ${label}`);
  chatData.content = DIV.innerHTML;
}

export function _preRollAttack(item, rollConfig) {
  // get bonuses:
  const bonuses = FILTER.itemCheck(item, "attack");
  if (!bonuses.length) return;
  const data = rollConfig.data;
  const target = game.user.targets.first();
  if (target?.actor) data.target = target.actor.getRollData();

  // add to parts:
  const { parts, optionals } = bonuses.reduce((acc, bab) => {
    const bonus = bab.bonuses.bonus;
    const valid = !!bonus && Roll.validate(bonus);
    if (!valid) return acc;
    if (bab.isOptional) acc.optionals.push(bab);
    else acc.parts.push(bonus);
    return acc;
  }, { parts: [], optionals: [] });
  if (parts.length) rollConfig.parts.push(...parts);
  if (optionals.length) {
    foundry.utils.setProperty(rollConfig, `dialogOptions.${MODULE}.optionals`, optionals);
  }

  // Gather up all bonuses.
  const flats = { crit: Infinity, fumble: -Infinity };
  const mods = { crit: [], fumble: [] };
  for (const bab of bonuses) {
    const cf = _bonusToInt(bab.bonuses.criticalRange, data);
    const ff = _bonusToInt(bab.bonuses.fumbleRange, data);
    if (bab.bonuses.criticalRangeFlat) {
      if (cf) flats.crit = Math.min(flats.crit, cf);
    } else mods.crit.push(cf);
    if (bab.bonuses.fumbleRangeFlat) {
      if (ff) flats.fumble = Math.max(flats.fumble, ff);
    } else mods.fumble.push(ff);
  }

  // Set to the thresholds first, then add modifiers to raise/lower.
  if (flats.crit < Infinity) rollConfig.critical = flats.crit;
  rollConfig.critical = mods.crit.reduce((acc, e) => acc - e, rollConfig.critical ?? 20);
  if (flats.fumble > -Infinity) rollConfig.fumble = flats.fumble;
  rollConfig.fumble = mods.fumble.reduce((acc, e) => acc + e, rollConfig.fumble ?? 1);

  // Don't set crit to below 1.
  if (rollConfig.critical < 1) rollConfig.critical = 1;
}

export function _preRollDamage(item, rollConfig) {
  // get bonus:
  const bonuses = FILTER.itemCheck(item, "damage", { spellLevel: rollConfig.data.item.level });
  if (!bonuses.length) return;
  const data = rollConfig.data;
  const target = game.user.targets.first();
  if (target?.actor) data.target = target.actor.getRollData();

  // add to parts:
  const { parts, optionals } = bonuses.reduce((acc, bab) => {
    const bonus = bab.bonuses.bonus;
    const valid = !!bonus && Roll.validate(bonus);
    if (!valid) return acc;
    if (bab.isOptional) acc.optionals.push(bab);
    else acc.parts.push(bonus);
    return acc;
  }, { parts: [], optionals: [] });
  if (parts.length) rollConfig.parts.push(...parts);
  if (optionals.length) {
    foundry.utils.setProperty(rollConfig, `dialogOptions.${MODULE}.optionals`, optionals);
  }

  // add to crit bonus dice:
  rollConfig.criticalBonusDice = bonuses.reduce((acc, bab) => {
    return acc + _bonusToInt(bab.bonuses.criticalBonusDice, data);
  }, rollConfig.criticalBonusDice ?? 0);
  if (rollConfig.criticalBonusDice < 0) rollConfig.criticalBonusDice = 0;

  // add to crit damage:
  rollConfig.criticalBonusDamage = bonuses.reduce((acc, bab) => {
    const bonus = bab.bonuses.criticalBonusDamage;
    const valid = !!bonus && Roll.validate(bonus);
    if (!valid) return acc;
    return `${acc} + ${bonus}`;
  }, rollConfig.criticalBonusDamage ?? "");
}

export function _preRollDeathSave(actor, rollConfig) {
  // get bonus:
  const bonuses = FILTER.throwCheck(actor, "death", {});
  if (!bonuses.length) return;
  const data = rollConfig.data;
  const target = game.user.targets.first();
  if (target?.actor) data.target = target.actor.getRollData();

  // add to parts:
  const { parts, optionals } = bonuses.reduce((acc, bab) => {
    const bonus = bab.bonuses.bonus;
    const valid = !!bonus && Roll.validate(bonus);
    if (!valid) return acc;
    if (bab.isOptional) acc.optionals.push(bab);
    else acc.parts.push(bonus);
    return acc;
  }, { parts: [], optionals: [] });
  if (parts.length) rollConfig.parts.push(...parts);
  if (optionals.length) {
    foundry.utils.setProperty(rollConfig, `dialogOptions.${MODULE}.optionals`, optionals);
  }

  // Gather up all bonuses.
  const death = { flat: Infinity, mods: [] };
  for (const bab of bonuses) {
    const df = _bonusToInt(bab.bonuses.deathSaveTargetValue, data);
    if (bab.bonuses.deathSaveTargetValueFlat) {
      if (df) death.flat = Math.min(death.flat, df);
    } else death.mods.push(df);
  }

  // Set to threshold first, then add modifiers to raise/lower.
  if (death.flat < Infinity) rollConfig.targetValue = death.flat;
  rollConfig.targetValue = death.mods.reduce((acc, e) => acc - e, rollConfig.targetValue ?? 10);
}

export function _preRollAbilitySave(actor, rollConfig, abilityId) {
  // get bonus:
  const bonuses = FILTER.throwCheck(actor, abilityId, {
    isConcSave: rollConfig.isConcSave
  });
  if (!bonuses.length) return;
  const target = game.user.targets.first();
  if (target?.actor) rollConfig.data.target = target.actor.getRollData();

  // add to parts:
  const { parts, optionals } = bonuses.reduce((acc, bab) => {
    const bonus = bab.bonuses.bonus;
    const valid = !!bonus && Roll.validate(bonus);
    if (!valid) return acc;
    if (bab.isOptional) acc.optionals.push(bab);
    else acc.parts.push(bonus);
    return acc;
  }, { parts: [], optionals: [] });
  if (parts.length) rollConfig.parts.push(...parts);
  if (optionals.length) {
    foundry.utils.setProperty(rollConfig, `dialogOptions.${MODULE}.optionals`, optionals);
  }
}

export function _preRollHitDie(actor, rollConfig, denomination) {
  const bonuses = FILTER.hitDieCheck(actor);
  if (!bonuses.length) return;
  const target = game.user.targets.first();
  if (target?.actor) rollConfig.data.target = target.actor.getRollData();

  const denom = bonuses.reduce((acc, bab) => {
    const bonus = bab.bonuses.bonus;
    const valid = !!bonus && Roll.validate(bonus);
    if (!valid) return acc;
    return `${acc} + ${bonus}`;
  }, denomination);
  rollConfig.formula = rollConfig.formula.replace(denomination, denom);
}
