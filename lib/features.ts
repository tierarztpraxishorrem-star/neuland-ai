export const appFeatureFlags = {
  personalDiamond: process.env.NEXT_PUBLIC_FEATURE_PERSONAL_DIAMOND !== '0',
};

export const isPersonalDiamondEnabled = () => appFeatureFlags.personalDiamond;
