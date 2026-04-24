import citiesData from "@/data/cities.json";

import type { RoutePoint } from "@/lib/types/map";

export interface CityCenterRecord {
  key: string;
  name_ar: string;
  name_en: string;
  latitude: number;
  longitude: number;
  aliases_ar: string[];
}

export interface CityMatch {
  city: CityCenterRecord;
  index: number;
  alias: string;
}

const CITY_CENTERS = citiesData.routing_city_centers as CityCenterRecord[];

function normalizePlaceText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ");
}

function getCityAliases(city: CityCenterRecord): string[] {
  return Array.from(
    new Set(
      [
        city.key,
        city.name_en,
        city.name_ar,
        ...city.aliases_ar,
        city.name_en.toLowerCase(),
      ]
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

export function getCityCenters(): CityCenterRecord[] {
  return CITY_CENTERS;
}

export function findCityByName(value: string | null | undefined): CityCenterRecord | null {
  if (!value) {
    return null;
  }

  const normalizedValue = normalizePlaceText(value);
  if (!normalizedValue) {
    return null;
  }

  return (
    CITY_CENTERS.find((city) =>
      getCityAliases(city).some((alias) => normalizedValue === normalizePlaceText(alias)),
    ) ?? null
  );
}

export function findCityMatchesInText(text: string): CityMatch[] {
  const normalizedText = normalizePlaceText(text);
  if (!normalizedText) {
    return [];
  }

  const matches = CITY_CENTERS.flatMap((city) =>
    getCityAliases(city).flatMap((alias) => {
      const normalizedAlias = normalizePlaceText(alias);
      if (!normalizedAlias) {
        return [];
      }

      const index = normalizedText.indexOf(normalizedAlias);
      if (index < 0) {
        return [];
      }

      return [
        {
          city,
          index,
          alias,
        },
      ];
    }),
  );

  return matches
    .sort((left, right) => {
      if (left.index !== right.index) {
        return left.index - right.index;
      }

      return right.alias.length - left.alias.length;
    })
    .filter((match, index, array) => {
      return (
        array.findIndex(
          (candidate) => candidate.city.key === match.city.key,
        ) === index
      );
    });
}

export function resolveCityPoint(
  value: string | null | undefined,
): { city: CityCenterRecord; point: RoutePoint } | null {
  const city = findCityByName(value);
  if (!city) {
    return null;
  }

  return {
    city,
    point: {
      lat: city.latitude,
      lng: city.longitude,
    },
  };
}

export function getCityDisplayLabel(city: CityCenterRecord): string {
  return `${city.name_en} · ${city.name_ar}`;
}

export function normalizePlaceLabel(value: string): string {
  return normalizePlaceText(value);
}
