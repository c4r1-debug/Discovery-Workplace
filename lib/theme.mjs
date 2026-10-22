export const THEME_STORAGE_KEY='discovery-theme';
export const THEME_BOOTSTRAP=`try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='light')document.documentElement.dataset.theme='light'}catch{}`;
