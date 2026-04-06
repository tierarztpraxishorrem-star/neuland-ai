export const COMMON_BREEDS = [
  'Affenpinscher',
  'Akita Inu',
  'American Staffordshire Terrier',
  'Australian Shepherd',
  'Beagle',
  'Bernhardiner',
  'Berner Sennenhund',
  'Bichon Frise',
  'Border Collie',
  'Boston Terrier',
  'Boxer',
  'Briard',
  'Bullterrier',
  'Cavalier King Charles Spaniel',
  'Chihuahua',
  'Cockerspaniel',
  'Dalmatiner',
  'Deutsch Drahthaar',
  'Deutsch Kurzhaar',
  'Deutsche Dogge',
  'Deutscher Schaeferhund',
  'Dobermann',
  'Englische Bulldogge',
  'Franzoesische Bulldogge',
  'Golden Retriever',
  'Grosspudel',
  'Havaneser',
  'Jack Russell Terrier',
  'Kaninchen',
  'Kleiner Muensterlaender',
  'Labrador Retriever',
  'Lagotto Romagnolo',
  'Main Coon',
  'Maine Coon',
  'Malteser',
  'Mops',
  'Muensterlaender',
  'Norwegische Waldkatze',
  'Perserkatze',
  'Ragdoll',
  'Rhodesian Ridgeback',
  'Rottweiler',
  'Siamkatze',
  'Sibirische Katze',
  'Toypudel',
  'Vizsla',
  'Weimaraner',
  'West Highland White Terrier',
  'Yorkshire Terrier',
  'Zwergkaninchen',
  'Zwergpudel'
];

export const searchBreeds = (query: string) => {
  const term = query.trim().toLowerCase();
  if (!term) return COMMON_BREEDS.slice(0, 10);

  return COMMON_BREEDS
    .filter((breed) => breed.toLowerCase().includes(term))
    .slice(0, 10);
};
