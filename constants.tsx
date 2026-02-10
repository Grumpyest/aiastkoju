
import { Language } from './types';

export const CATEGORIES = [
  "Köögiviljad",
  "Marjad",
  "Puuviljad",
  "Seemned",
  "Istikud",
  "Konservid",
  "Mesi & hoidised",
  "Maitsetaimed",
  "Muu"
];

export const UNITS = ["tk", "kg", "g", "l", "purk", "kimp"];

export const TRANSLATIONS: Record<Language, any> = {
  [Language.ET]: {
    nav: {
      home: "Avaleht",
      catalog: "Kataloog",
      orders: "Tellimused",
      dashboard: "Töölaud",
      admin: "Admin",
      login: "Logi sisse",
      register: "Registreeru",
      logout: "Logi välja"
    },
    hero: {
      title: "Värske kraam otse aiast sinu lauale",
      subtitle: "Toeta kohalikke aednikke ja naudi puhtaimat toitu.",
      searchPlaceholder: "Mida soovid täna leida?"
    },
    categories: {
      "Köögiviljad": "Köögiviljad",
      "Marjad": "Marjad",
      "Puuviljad": "Puuviljad",
      "Seemned": "Seemned",
      "Istikud": "Istikud",
      "Konservid": "Konservid",
      "Mesi & hoidised": "Mesi & hoidised",
      "Maitsetaimed": "Maitsetaimed",
      "Muu": "Muu"
    },
    common: {
      price: "Hind",
      unit: "Ühik",
      add_to_cart: "Lisa ostukorvi",
      buy: "Osta",
      view_details: "Vaata lähemalt",
      location: "Asukoht",
      stock: "Laos",
      empty_cart: "Ostukorv on tühi",
      checkout: "Vormista tellimus",
      confirm: "Kinnita",
      cancel: "Tühista"
    }
  },
  [Language.EN]: {
    nav: {
      home: "Home",
      catalog: "Catalog",
      orders: "Orders",
      dashboard: "Dashboard",
      admin: "Admin",
      login: "Login",
      register: "Register",
      logout: "Logout"
    },
    hero: {
      title: "Fresh produce from garden to your table",
      subtitle: "Support local gardeners and enjoy the purest food.",
      searchPlaceholder: "What are you looking for today?"
    },
    categories: {
      "Köögiviljad": "Vegetables",
      "Marjad": "Berries",
      "Puuviljad": "Fruits",
      "Seemned": "Seeds",
      "Istikud": "Saplings",
      "Konservid": "Preserves",
      "Mesi & hoidised": "Honey & Jams",
      "Maitsetaimed": "Herbs",
      "Muu": "Other"
    },
    common: {
      price: "Price",
      unit: "Unit",
      add_to_cart: "Add to cart",
      buy: "Buy",
      view_details: "View details",
      location: "Location",
      stock: "Stock",
      empty_cart: "Cart is empty",
      checkout: "Checkout",
      confirm: "Confirm",
      cancel: "Cancel"
    }
  },
  [Language.RU]: {
    nav: {
      home: "Главная",
      catalog: "Каталог",
      orders: "Заказы",
      dashboard: "Панель",
      admin: "Админ",
      login: "Войти",
      register: "Регистрация",
      logout: "Выйти"
    },
    hero: {
      title: "Свежие продукты из сада на ваш стол",
      subtitle: "Поддержите местных садоводов и ешьте чистую еду.",
      searchPlaceholder: "Что вы ищете сегодня?"
    },
    categories: {
      "Köögiviljad": "Овощи",
      "Marjad": "Ягоды",
      "Puuviljad": "Фрукты",
      "Seemned": "Семена",
      "Istikud": "Саженцы",
      "Konservid": "Консервы",
      "Mesi & hoidised": "Мед и заготовки",
      "Maitsetaimed": "Травы",
      "Muu": "Другое"
    },
    common: {
      price: "Цена",
      unit: "Ед.",
      add_to_cart: "В корзину",
      buy: "Купить",
      view_details: "Подробнее",
      location: "Местоположение",
      stock: "В наличии",
      empty_cart: "Корзина пуста",
      checkout: "Оформить заказ",
      confirm: "Подтвердить",
      cancel: "Отмена"
    }
  }
};
