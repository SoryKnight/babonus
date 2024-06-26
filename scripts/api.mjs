import {MODULE} from "./constants.mjs";
import {default as applications} from "./applications/_module.mjs";
import {default as filters} from "./filters/_module.mjs";
import {default as models} from "./models/babonus-model.mjs";
import {default as fields} from "./models/_module.mjs";

/**
 * Set up the public API.
 */
export function createAPI() {
  const API = {
    getId, getIds,
    getName, getNames,
    getType,
    getCollection,
    fromUuid: babonusFromUuid,
    fromUuidSync: babonusFromUuidSync,

    deleteBonus, copyBonus,
    toggleBonus, moveBonus,
    createBabonus, embedBabonus,
    hotbarToggle: hotbarToggle,

    findEmbeddedDocumentsWithBonuses,
    findTokensInRangeOfAura,
    findTokensInRangeOfToken,
    openBabonusWorkshop,
    getAllContainingTemplates,
    getMinimumDistanceBetweenTokens,
    sceneTokensByDisposition,
    getOccupiedGridSpaces,
    createRestrictedCircle,
    createRestrictedRect,
    findTokensCircle,
    findTokensRect,
    createRect,
    speaksLanguage: speaksLanguage,
    hasWeaponProficiency: hasWeaponProficiency,
    hasArmorProficiency: hasArmorProficiency,
    hasToolProficiency: hasToolProficiency,
    proficiencyTree: proficiencyTree,

    abstract: {
      DataModels: models,
      DataFields: {
        filters: filters,
        models: fields
      },
      TYPES: Object.keys(models),
      applications: applications
    },

    filters: Object.keys(filters).reduce((acc, key) => {
      acc[key] = applications.FilterManager[key];
      return acc;
    }, {})
  };
  window.babonus = game.modules.get(MODULE.ID).api = API;
}

/**
 * Return a babonus that has the given name. If more are found, returns the first found.
 * @param {Document} object     The document that has the babonus.
 * @param {string} name         The name of the babonus.
 * @returns {Babonus}           The found babonus.
 */
function getName(object, name) {
  return getCollection(object).getName(name);
}

/**
 * Return the names of all bonuses on the document.
 * @param {Document} object     The document that has the babonuses.
 * @returns {string[]}          An array of names.
 */
function getNames(object) {
  const set = new Set();
  getCollection(object).forEach(bonus => set.add(bonus.name));
  return Array.from(set);
}

/**
 * Return a babonus that has the given id.
 * @param {Document} object     The document that has the babonus.
 * @param {string} id           The id of the babonus.
 * @returns {Babonus}           The found babonus.
 */
function getId(object, id) {
  return getCollection(object).get(id);
}

/**
 * Return the ids of all bonuses on the document.
 * @param {Document} object     The document that has the babonuses.
 * @returns {string[]}          An array of ids.
 */
function getIds(object) {
  const set = new Set();
  getCollection(object).forEach(bonus => set.add(bonus.id));
  return Array.from(set);
}

/**
 * Return an array of the bonuses of a given type on the document.
 * @param {Document} object     The document that has the babonuses.
 * @param {string} type         The type of babonuses to find.
 * @returns {Babonus[]}         An array of babonuses.
 */
function getType(object, type) {
  return getCollection(object).filter(b => b.type === type);
}

/**
 * Return the ids of all templates on the scene if they contain the token document.
 * @param {TokenDocument5e} tokenDoc      The token document.
 * @param {object} [options]              Search options.
 * @param {boolean} [options.ids]         Whether to return ids or template documents.
 * @returns {string[]}                    An array of ids.
 */
function getAllContainingTemplates(tokenDoc, {ids = true} = {}) {
  const centers = getOccupiedGridSpaces(tokenDoc);
  const templates = tokenDoc.parent.templates.reduce((acc, template) => {
    const contains = centers.some(({x, y}) => template.object.shape.contains(x - template.x, y - template.y));
    if (!contains) return acc;
    acc.push(ids ? template.id : template);
    return acc;
  }, []);
  return templates;
}

/**
 * Delete a babonus from a document.
 * @param {Document} object         A measured template, active effect, actor, or item to delete from.
 * @param {string} id               The id of the babonus to remove.
 * @returns {Promise<Document>}     The updated document.
 */
async function deleteBonus(object, id) {
  const bonus = getId(object, id);
  if (!bonus) return null;
  return object.update({[`flags.babonus.bonuses.-=${bonus.id}`]: null});
}

/**
 * Copy a babonus from a document to another.
 * @param {Document} original       A measured template, active effect, actor, or item to copy from.
 * @param {Document} other          A measured template, active effect, actor, or item to copy to.
 * @param {string} id               The id of the babonus to copy.
 * @returns {Promise<Document>}     The original after the update.
 */
async function copyBonus(original, other, id) {
  const bonus = getId(original, id);
  if (!bonus) return null;
  return applications.BabonusWorkshop._embedBabonus(other, bonus);
}

/**
 * Move a babonus from a document to another.
 * @param {Document} original       A measured template, active effect, actor, or item to move from.
 * @param {Document} other          A measured template, active effect, actor, or item to move to.
 * @param {string} id               The id of the babonus to move.
 * @returns {Promise<Document>}     The other document after the update.
 */
async function moveBonus(original, other, id) {
  const copy = await copyBonus(original, other, id);
  if (!copy) return null;
  return deleteBonus(original, id);
}

/**
 * Toggle a babonus on a document
 * @param {Document} object         A measured template, active effect, actor, or item.
 * @param {string} id               The id of the babonus to toggle.
 * @param {boolean} [state]         A specific toggle state to set a babonus to.
 * @returns {Promise<Document>}     The document after the update.
 */
async function toggleBonus(object, id, state = null) {
  const bonus = getId(object, id);
  if (!bonus) return null;
  return applications.BabonusWorkshop._onToggleBonus(bonus, state);
}

/**
 * Return an object of arrays of items and effects on the given document
 * that have one or more babonuses embedded in them.
 * @param {Document} object     An actor or item with embedded documents.
 * @returns {object}            An object with an array of effects and array of items.
 */
function findEmbeddedDocumentsWithBonuses(object) {
  let items = [];
  let effects = [];

  if (object instanceof Actor) {
    items = object.items.filter(item => {
      return getCollection(item).size > 0;
    });
  }
  if ((object instanceof Actor) || (object instanceof Item)) {
    effects = object.effects.filter(effect => {
      return getCollection(effect).size > 0;
    });
  }
  return {effects, items};
}

/**
 * Return all token documents that are in range of an aura.
 * This does not take sight and movement restrictions into account.
 * @param {Document} object         The actor, item, or effect with the babonus.
 * @param {string} id               The id of the babonus.
 * @returns {TokenDocument5e[]}     An array of token documents.
 */
function findTokensInRangeOfAura(object, id) {
  const bonus = getId(object, id);
  if (!bonus.aura.isToken) return [];
  const token = bonus.token;
  if (!token) return [];
  const range = bonus.aura.range;
  if (range === -1) return canvas.scene.tokens.filter(t !== token.document);
  return findTokensInRangeOfToken(token, range).map(t => t.document);
}

/**
 * Return an array of tokens that are within a radius of the source token.
 * Credit to @Freeze#2689 for much artistic aid.
 * @param {Token5e} source      The source token placeable.
 * @param {number} radius       The radius (usually feet) to extend from the source.
 * @param {string} [type]       The type of shape to use for locating ('circle' or 'rect').
 * @returns {Token5e[]}         An array of token placeables, excluding the source.
 */
function findTokensInRangeOfToken(source, radius, type = "circle") {
  if (type === "circle") return findTokensCircle(source, radius);
  else if (type === "rect") return findTokensRect(source, radius);
  else return [];
}

/**
 * Return the minimum distance between two tokens, evaluating height and all grid spaces they occupy.
 * @param {Token5e} tokenA        One token placeable.
 * @param {Token5e} tokenB        Another token placeable.
 * @param {object} [options]      Options to modify the measurements.
 * @returns {number}              The minimum distance (in units of measurement).
 */
function getMinimumDistanceBetweenTokens(tokenA, tokenB, options = {}) {
  const spacesA = getOccupiedGridSpaces(tokenA.document);
  const spacesB = getOccupiedGridSpaces(tokenB.document);
  // Construct rays between each grid center of tokenA to each grid center of tokenB.
  const rays = spacesA.flatMap(a => spacesB.map(b => ({ray: new Ray(a, b)})));
  const horizontalDistance = Math.min(Infinity, ...canvas.grid.measureDistances(rays, options));
  const verticalDistance = Math.abs(tokenA.document.elevation - tokenB.document.elevation);
  return Math.max(horizontalDistance, verticalDistance);
}

/**
 * Render the build-a-bonus application for a document.
 * @param {Document} object       An actor, item, or effect.
 * @returns {BabonusWorkshop}     The rendered workshop.
 */
function openBabonusWorkshop(object) {
  const validDocumentType = ["Actor", "Item", "ActiveEffect"].includes(object.documentName);
  if (!validDocumentType) throw new Error("The document provided is not a valid document type for Build-a-Bonus!");
  return new applications.BabonusWorkshop(object).render(true);
}

/**
 * Create a babonus in memory with the given data.
 * @param {object} data           An object of babonus data.
 * @param {Document} [parent]     The document to act as parent of the babonus.
 * @returns {Babonus}             The created babonus.
 */
function createBabonus(data, parent = null) {
  if (!(data.type in models)) throw new Error("INVALID BABONUS TYPE.");
  data.id = foundry.utils.randomID();
  return new models[data.type](data, {parent});
}

/**
 * Return the scene's token documents in four arrays split by disposition.
 * @param {Scene} scene     A scene that contains tokens.
 * @returns {object}        An object of the four arrays.
 */
function sceneTokensByDisposition(scene) {
  return scene.tokens.reduce((acc, tokenDoc) => {
    const d = tokenDoc.disposition;
    const t = CONST.TOKEN_DISPOSITIONS;
    if (d === t.HOSTILE) acc.hostiles.push(tokenDoc);
    else if (d === t.FRIENDLY) acc.friendlies.push(tokenDoc);
    else if (d === t.NEUTRAL) acc.neutrals.push(tokenDoc);
    else if (d === t.SECRET) acc.secret.push(tokenDoc);
    return acc;
  }, {hostiles: [], friendlies: [], neutrals: [], secret: []});
}

/**
 * Get the centers of all grid spaces that overlap with a token document.
 * @param {TokenDocument5e} tokenDoc      The token document on the scene.
 * @returns {object[]}                    An array of xy coordinates.
 */
function getOccupiedGridSpaces(tokenDoc) {
  return applications.BonusCollector._collectTokenCenters(tokenDoc);
}

/**
 * Internal helper method for fromUuid and fromUuidSync.
 * @param {string} uuid     Babonus uuid.
 * @returns {{parentUuid: string, id: string}}
 */
const _getParentUuidAndId = (uuid) => {
  const parts = uuid.split(".");
  const id = parts.pop();
  parts.pop();
  const parentUuid = parts.join(".");
  return {parentUuid, id};
};

/**
 * Return a babonus using its uuid.
 * @param {string} uuid                 The babonus uuid.
 * @returns {Promise<Babonus|null>}     The found babonus.
 */
async function babonusFromUuid(uuid) {
  try {
    const ids = _getParentUuidAndId(uuid);
    const parent = await fromUuid(ids.parentUuid);
    return getId(parent, ids.id);
  } catch (err) {
    return null;
  }
}

/**
 * Return a babonus using its uuid synchronously.
 * @param {string} uuid         The babonus uuid.
 * @returns {Babonus|null}      The found babonus.
 */
function babonusFromUuidSync(uuid) {
  try {
    const ids = _getParentUuidAndId(uuid);
    const parent = fromUuidSync(ids.parentUuid);
    return getId(parent, ids.id);
  } catch (err) {
    return null;
  }
}

/**
 * Return the collection of bonuses on the document.
 * @param {Document} object           An actor, item, effect, or template.
 * @returns {Collection<Babonus>}     A collection of babonuses.
 */
function getCollection(object) {
  const bonuses = Object.entries(object.flags[MODULE.ID]?.bonuses ?? {});
  const contents = bonuses.reduce((acc, [id, data]) => {
    if (!foundry.data.validators.isValidId(id)) return acc;
    try {
      data.id = id;
      const bonus = new models[data.type](data, {parent: object});
      acc.push([id, bonus]);
    } catch (err) {
      console.warn(err);
    }
    return acc;
  }, []);
  return new foundry.utils.Collection(contents);
}

/**
 * Embed a created babonus onto the target object.
 * @param {Document} object         The actor, item, or effect that should have the babonus.
 * @param {Babonus} bonus           The created babonus.
 * @returns {Promise<Document>}     The actor, item, or effect that has received the babonus.
 */
async function embedBabonus(object, bonus) {
  const validDocumentType = ["Actor", "Item", "ActiveEffect"].includes(object.documentName);
  if (!validDocumentType) throw new Error("The document provided is not a valid document type for Build-a-Bonus!");
  if (!Object.values(models).some(t => bonus instanceof t)) return null;
  return applications.BabonusWorkshop._embedBabonus(object, bonus);
}

/**
 * Hotbar method for toggling a bonus via uuid.
 * @param {string} uuid       Uuid of the bonus to toggle.
 * @returns {Promise<null|Babonus>}
 */
async function hotbarToggle(uuid) {
  const bonus = await babonusFromUuid(uuid);
  if (!bonus) {
    ui.notifications.warn("BABONUS.BonusNotFound", {localize: true});
    return;
  }
  return bonus.toggle();
}

/**
 * Create pixi circle with some size and restrictions, centered on a token.
 * @param {Token5e} token             The center.
 * @param {number} size               The range in feet.
 * @param {object} [restrictions]     Wall restrictions.
 * @returns {ClockwiseSweepPolygon}
 */
function createRestrictedCircle(token, size, restrictions = {}) {
  const hasLimitedRadius = size > 0;
  let radius;
  if (hasLimitedRadius) {
    const cd = canvas.dimensions;
    radius = size * cd.distancePixels + token.document.width * cd.size / 2;
  }

  restrictions = CONST.WALL_RESTRICTION_TYPES.filter(type => restrictions[type]);
  let sweep = ClockwiseSweepPolygon.create(token.center, {
    radius: radius,
    hasLimitedRadius: hasLimitedRadius
  });

  for (const type of restrictions) {
    sweep = sweep.applyConstraint(ClockwiseSweepPolygon.create(token.center, {
      radius: radius,
      type: type,
      hasLimitedRadius: hasLimitedRadius,
      useThreshold: type !== "move"
    }));
  }
  return sweep;
}

/**
 * Create pixi rectangle with some size and restrictions, centered on a token.
 * @param {Token5e} token             The center.
 * @param {number} size               The range in feet.
 * @param {object} [restrictions]     Wall restrictions.
 * @returns {ClockwiseSweepPolygon}
 */
function createRestrictedRect(token, size, restrictions = {}) {
  const rectangles = (size > 0) ? [createRect(token, size)] : [];

  restrictions = CONST.WALL_RESTRICTION_TYPES.filter(type => restrictions[type]);
  let sweep = ClockwiseSweepPolygon.create(token.center, {
    boundaryShapes: rectangles
  });

  for (const type of restrictions) {
    sweep = sweep.applyConstraint(ClockwiseSweepPolygon.create(token.center, {
      type: type,
      boundaryShapes: rectangles,
      useThreshold: type !== "move"
    }));
  }
  return sweep;
}

/**
 * Find tokens within a given circular distance from another token.
 * @param {Token5e} token             The token that is in the center of the circle.
 * @param {number} size               The radius of the circle, in feet.
 * @param {object} [restrictions]     Valid wall restrictions within the area.
 * @returns {Token5e[]}
 */
function findTokensCircle(token, size, restrictions = {}) {
  const sweep = createRestrictedCircle(token, size, restrictions);
  const rect = createRect(token, size);
  const tokens = canvas.tokens.quadtree.getObjects(rect, {
    collisionTest: ({t}) => {
      if (t.id === token.id) return false;
      const centers = applications.BonusCollector._collectTokenCenters(t.document);
      return centers.some(c => sweep.contains(c.x, c.y));
    }
  });
  return Array.from(tokens);
}

/**
 * Find tokens within a given rectangular distance from another token.
 * @param {Token5e} token             The token that is in the center of the rectangle.
 * @param {number} size               The 'radius' of the rectangle, in feet.
 * @param {object} [restrictions]     Valid wall restrictions within the area.
 * @returns {Token5e[]}
 */
function findTokensRect(token, size, restrictions = {}) {
  const sweep = createRestrictedRect(token, size, restrictions);
  const rect = createRect(token, size);
  const tokens = canvas.tokens.quadtree.getObjects(rect, {
    collisionTest: ({t}) => {
      if (t.id === token.id) return false;
      const centers = applications.BonusCollector._collectTokenCenters(t.document);
      return centers.some(c => sweep.contains(c.x, c.y));
    }
  });
  return Array.from(tokens);
}

/**
 * Create a rectangle of a given size centered on a token.
 * @param {Token5e} token     The token that is in the center of the rectangle.
 * @param {number} size       The 'radius' of the rectangle, in feet.
 * @returns {PIXI}
 */
function createRect(token, size) {
  const spaces = size / canvas.dimensions.distance;
  const {x, y, width} = token.document;
  const x0 = x - spaces * canvas.grid.size;
  const y0 = y - spaces * canvas.grid.size;
  const dist = (width + 2 * spaces) * canvas.grid.size;
  return new PIXI.Rectangle(x0, y0, dist, dist);
}

/**
 * Does this actor speak a given language?
 * @param {Actor5e} actor     The actor to test.
 * @param {string} trait      The language to test.
 * @returns {boolean}
 */
function speaksLanguage(actor, trait) {
  return _hasTrait(actor, trait, "languages");
}

/**
 * Does this actor have a given weapon proficiency?
 * @param {Actor5e} actor     The actor to test.
 * @param {string} trait      The trait to test.
 * @returns {boolean}
 */
function hasWeaponProficiency(actor, trait) {
  return _hasTrait(actor, trait, "weapon");
}

/**
 * Does this actor have a given armor proficiency?
 * @param {Actor5e} actor     The actor to test.
 * @param {string} trait      The trait to test.
 * @returns {boolean}
 */
function hasArmorProficiency(actor, trait) {
  return _hasTrait(actor, trait, "armor");
}

/**
 * Does this actor have a given tool proficiency?
 * @param {Actor5e} actor     The actor to test.
 * @param {string} trait      The trait to test.
 * @returns {boolean}
 */
function hasToolProficiency(actor, trait) {
  return _hasTrait(actor, trait, "tool");
}

function _hasTrait(actor, trait, category) {
  const path = CONFIG.DND5E.traits[category].actorKeyPath ?? `system.traits.${category}`;
  const set = foundry.utils.getProperty(actor, path)?.value ?? new Set();
  if (set.has(trait)) return true;
  return set.some(v => {
    const [k, obj] = babonus.trees[category].find(v) ?? [];
    return (k === trait) || (obj.children && obj.children.find(trait));
  });
}

/**
 * Retrieve a path through nested proficiencies to find a specific proficiency in a category.
 * E.g., 'smith' and 'tool' will return ['art', 'smith'], and 'aquan' and 'languages' will
 * return ['exotic', 'primordial', 'aquan'].
 * @param {string} key          The specific proficiency (can be a category), e.g., "smith" or "primordial".
 * @param {string} category     The trait category, e.g., "tool", "weapon", "armor", "languages".
 * @returns {string[]}
 */
function proficiencyTree(key, category) {
  const root = babonus.trees[category];
  const path = [];

  const find = (node) => {
    for (const [k, v] of Object.entries(node)) {
      if ((k === key)) {
        path.unshift(k);
        return true;
      } else if (v.children) {
        const result = find(v.children);
        if (result) {
          path.unshift(k);
          return true;
        }
      }
    }
    path.shift();
    return false;
  };

  find(root);
  return path;
}
