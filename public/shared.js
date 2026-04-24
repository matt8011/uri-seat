export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers
  });

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function parseRecipes(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function formatMetric(value) {
  return value === null || value === undefined ? 'Pending' : Number(value).toFixed(2);
}

export function formatDateTime(value) {
  if (!value) {
    return 'N/A';
  }

  return new Date(value).toLocaleString();
}

function valueOrZero(value) {
  return value === null || value === undefined ? 0 : Number(value);
}

function roundMetric(value, precision = 4) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function calculateNutrientRichFoodIndex(item) {
  const index =
    (valueOrZero(item.protein) / 50 +
      valueOrZero(item.fiber) / 25 +
      valueOrZero(item.vitamin_a) / 5000 +
      valueOrZero(item.vitamin_c) / 60 +
      valueOrZero(item.vitamin_e) / 30 +
      valueOrZero(item.calcium) / 1000 +
      valueOrZero(item.iron) / 18 +
      valueOrZero(item.magnesium) / 400 +
      valueOrZero(item.potassium) / 3500 -
      valueOrZero(item.saturated_fat) / 20 -
      valueOrZero(item.added_sugar) / 50 -
      valueOrZero(item.sodium) / 2400) *
    100;

  return roundMetric(index);
}

export function calculateNutritionCompositeScore(index) {
  if (index <= 4.1) {
    return 1;
  }
  if (index <= 10.6) {
    return 2;
  }
  if (index <= 18.2) {
    return 3;
  }
  if (index <= 30.5) {
    return 4;
  }
  return 5;
}

export function calculateEnvironmentalCompositeScore(item) {
  const values = {
    freshwater_withdrawals: item.freshwater_withdrawals,
    stress_weighted_water_use: item.stress_weighted_water_use,
    acidifying_emissions: item.acidifying_emissions,
    eutrophying_emissions: item.eutrophying_emissions,
    ghg_emissions: item.ghg_emissions,
    land_use: item.land_use
  };

  if (Object.values(values).some((value) => value === null || value === undefined)) {
    return null;
  }

  const {
    scoreFreshwaterWithdrawals,
    scoreStressWeightedWaterUse,
    scoreAcidifyingEmissions,
    scoreEutrophyingEmissions,
    scoreGhgEmissions,
    scoreLandUse
  } = calculateEnvironmentalIndicatorScores(values);

  return roundMetric(
    (
      scoreFreshwaterWithdrawals +
      scoreStressWeightedWaterUse +
      scoreAcidifyingEmissions +
      scoreEutrophyingEmissions +
      scoreGhgEmissions +
      scoreLandUse
    ) / 6
  );
}

export function calculateEnvironmentalIndicatorScores(item) {
  return {
    scoreFreshwaterWithdrawals: Number(item.freshwater_withdrawals) > 549.9
      ? 1
      : Number(item.freshwater_withdrawals) > 377.1
        ? 2
        : Number(item.freshwater_withdrawals) > 263.7
          ? 3
          : Number(item.freshwater_withdrawals) > 161.4
            ? 4
            : 5,
    scoreStressWeightedWaterUse: Number(item.stress_weighted_water_use) > 18475
      ? 1
      : Number(item.stress_weighted_water_use) > 12806
        ? 2
        : Number(item.stress_weighted_water_use) > 9079
          ? 3
          : Number(item.stress_weighted_water_use) > 5601
            ? 4
            : 5,
    scoreAcidifyingEmissions: Number(item.acidifying_emissions) > 34.4
      ? 1
      : Number(item.acidifying_emissions) > 22.6
        ? 2
        : Number(item.acidifying_emissions) > 15.4
          ? 3
          : Number(item.acidifying_emissions) > 9.3
            ? 4
            : 5,
    scoreEutrophyingEmissions: Number(item.eutrophying_emissions) > 28
      ? 1
      : Number(item.eutrophying_emissions) > 16.3
        ? 2
        : Number(item.eutrophying_emissions) > 10.2
          ? 3
          : Number(item.eutrophying_emissions) > 6.1
            ? 4
            : 5,
    scoreGhgEmissions: Number(item.ghg_emissions) > 5.8
      ? 1
      : Number(item.ghg_emissions) > 3.4
        ? 2
        : Number(item.ghg_emissions) > 2.2
          ? 3
          : Number(item.ghg_emissions) > 1.4
            ? 4
            : 5,
    scoreLandUse: Number(item.land_use) > 13
      ? 1
      : Number(item.land_use) > 5.9
        ? 2
        : Number(item.land_use) > 3.7
          ? 3
          : Number(item.land_use) > 2.1
            ? 4
            : 5
  };
}

export function calculateEnvironmentalFactorScores(item) {
  const values = [
    item.freshwater_withdrawals,
    item.stress_weighted_water_use,
    item.acidifying_emissions,
    item.eutrophying_emissions,
    item.ghg_emissions,
    item.land_use
  ];

  if (values.some((value) => value === null || value === undefined)) {
    return {
      water_use_score: null,
      nitrogen_use_score: null,
      carbon_use_score: null,
      land_use_score: null
    };
  }

  const {
    scoreFreshwaterWithdrawals,
    scoreStressWeightedWaterUse,
    scoreAcidifyingEmissions,
    scoreEutrophyingEmissions,
    scoreGhgEmissions,
    scoreLandUse
  } = calculateEnvironmentalIndicatorScores(item);

  return {
    water_use_score: roundMetric(
      (scoreFreshwaterWithdrawals + scoreStressWeightedWaterUse) / 2
    ),
    nitrogen_use_score: roundMetric(
      (scoreAcidifyingEmissions + scoreEutrophyingEmissions) / 2
    ),
    carbon_use_score: roundMetric(scoreGhgEmissions),
    land_use_score: roundMetric(scoreLandUse)
  };
}

export function calculateSustainabilityIndex(
  nutritionCompositeScore,
  environmentalCompositeScore
) {
  if (
    nutritionCompositeScore === null ||
    nutritionCompositeScore === undefined ||
    environmentalCompositeScore === null ||
    environmentalCompositeScore === undefined
  ) {
    return null;
  }

  return roundMetric(Number(nutritionCompositeScore) + Number(environmentalCompositeScore));
}

export function getSustainabilityPalette(score) {
  if (score === null || score === undefined) {
    return {
      background: 'rgba(36, 79, 56, 0.08)',
      border: 'rgba(36, 79, 56, 0.16)',
      text: '#244f38'
    };
  }

  const normalized = Math.max(0, Math.min(Number(score), 10)) / 10;
  const hue = normalized * 120;

  return {
    background: `hsl(${hue} 78% 84%)`,
    border: `hsl(${hue} 58% 62%)`,
    text: `hsl(${hue} 78% 18%)`
  };
}
