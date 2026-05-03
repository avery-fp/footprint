export const ENABLE_DEPTH_TILE = true

export type DepthPreviewItem = {
  id: string
  imageUrl: string
  brand: string
  title: string
  price: string
  age: string
  externalUrl: string
}

export type DepthProvider = {
  id: string
  match: (url: string) => boolean
  closedLabel: string
  expandedTitle: string
  externalUrl: string
  descriptor?: string
  previewItems: DepthPreviewItem[]
}

const GRAILED_ITEMS: DepthPreviewItem[] = [
  {
    id: '1',
    imageUrl: 'https://picsum.photos/seed/grl1/300/400',
    brand: 'Rick Owens',
    title: 'Cargo Belas Pants',
    price: '$280',
    age: '2 days ago',
    externalUrl: 'https://www.grailed.com',
  },
  {
    id: '2',
    imageUrl: 'https://picsum.photos/seed/grl2/300/400',
    brand: 'Yohji Yamamoto',
    title: 'Draped Wool Coat AW03',
    price: '$620',
    age: '5 days ago',
    externalUrl: 'https://www.grailed.com',
  },
  {
    id: '3',
    imageUrl: 'https://picsum.photos/seed/grl3/300/400',
    brand: 'Comme des Garçons',
    title: 'Twisted Seam Blazer',
    price: '$450',
    age: '1 week ago',
    externalUrl: 'https://www.grailed.com',
  },
  {
    id: '4',
    imageUrl: 'https://picsum.photos/seed/grl4/300/400',
    brand: 'Helmut Lang',
    title: 'Archive Bondage Trousers',
    price: '$390',
    age: '3 days ago',
    externalUrl: 'https://www.grailed.com',
  },
  {
    id: '5',
    imageUrl: 'https://picsum.photos/seed/grl5/300/400',
    brand: 'Maison Margiela',
    title: 'Artisanal Shoulder Bag SS05',
    price: '$780',
    age: '4 days ago',
    externalUrl: 'https://www.grailed.com',
  },
  {
    id: '6',
    imageUrl: 'https://picsum.photos/seed/grl6/300/400',
    brand: 'Issey Miyake',
    title: 'Pleats Please Wide Trousers',
    price: '$210',
    age: '1 week ago',
    externalUrl: 'https://www.grailed.com',
  },
]

const GRAILED_PROVIDER: DepthProvider = {
  id: 'grailed',
  match: (url: string) => url.includes('grailed.com'),
  closedLabel: 'grailed.com',
  expandedTitle: 'Grailed Favorites',
  descriptor: 'favorites',
  externalUrl: 'https://www.grailed.com',
  previewItems: GRAILED_ITEMS,
}

const PROVIDERS: DepthProvider[] = [GRAILED_PROVIDER]

export function matchDepthProvider(url: string): DepthProvider | null {
  if (!ENABLE_DEPTH_TILE) return null
  return PROVIDERS.find((p) => p.match(url)) ?? null
}
