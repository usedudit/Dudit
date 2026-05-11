export const DEFAULT_BANNERS = [
    'https://img.dudit.com.br/static/banners/default/Blue.png',
    'https://img.dudit.com.br/static/banners/default/Gray.png',
    'https://img.dudit.com.br/static/banners/default/Orange.png',
    'https://img.dudit.com.br/static/banners/default/Pink.png',
    'https://img.dudit.com.br/static/banners/default/Purple.png',
    'https://img.dudit.com.br/static/banners/default/Red.png',
    'https://img.dudit.com.br/static/banners/default/Green.png',
]

export const getRandomDefaultBanner = () => {
    return DEFAULT_BANNERS[Math.floor(Math.random() * DEFAULT_BANNERS.length)]
}
