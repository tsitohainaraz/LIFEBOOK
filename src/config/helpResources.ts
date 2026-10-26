// Contacts d'aide affichés quand l'assistante détecte une détresse.
// À REMPLIR avec des numéros vérifiés pour Madagascar

export interface HelpResource {
  name: string;
  phone?: string;
  url?: string;
  description?: string;
}

export const helpResources: HelpResource[] = [];
