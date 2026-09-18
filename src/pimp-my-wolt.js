(function () {
  const logoUrl = chrome.runtime.getURL(
    "assets/icons/pimp-my-wolt-icon-48.png"
  );

  const { wheel } = window.pimpMyWolt;
  const { MicroModal } = window;

  const isHebrewWolt = window.location.href.toLowerCase().includes("com/he/");

  const getCurrentLangugue = (english, hebrew) => isHebrewWolt ? hebrew : english

  const texts = {
    readyText: getCurrentLangugue("Ready", "מוכנ/ה"),
    wheelButtonTooltip: getCurrentLangugue("Don't know what to order yet?", "לא יודעים מה להזמין עדיין?"),
    orderSubtotalPrice: getCurrentLangugue("subtotal", "סכום ההזמנה"),
    orderDeliveryPrice: getCurrentLangugue("Delivery", "משלוח"),
    orderSmallFeePrice: getCurrentLangugue("Small order fee", "תוספת מחיר להזמנה קטנה מדי"),
    orderTipPrice: getCurrentLangugue("tip", "טיפ לשליח"),
    orderServiceFeePrice: getCurrentLangugue("Service fee", "דמי תפעול")
  }

  const wheelButtonSettings = {
    id: "wheel-button-pimpMyWolt",
  };

  const orderButtonHookSettings = {
    saveOrdersAttribute: "save-orders",
  };

  const isParticipantTableExists = () =>
    Boolean(getElementWithText("li", texts.readyText));
  const isOrderButtonExists = () =>
    Boolean(document.querySelector('[data-test-id="SendOrderButton"]'));

  const isWheelButtonExists = () =>
    Boolean(document.getElementById(wheelButtonSettings.id));
  const isInMainPage = () =>
    Boolean(window.location.href.toLowerCase().includes("discovery"));
  const isOrderButtonUpdated = () => {
    const orderButton = document.querySelector(
      '[data-test-id="SendOrderButton"]'
    );
    return (
      orderButton.getAttribute(orderButtonHookSettings.saveOrdersAttribute) ===
      "true"
    );
  };

  function getElementsWithText(element, text, deepest = false) {
    const result = [];
    const xpath = deepest
      ? `//${element}[contains(text(), '${text}')]`
      : `//${element}[.//*[contains(text(), '${text}')]]`;
    const generator = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ANY_TYPE,
      null
    );
    let current = generator.iterateNext();
    while (current) {
      result.push(current);
      current = generator.iterateNext();
    }
    return result;
  }

  function getElementWithText(element, text, deepest = false) {
    return getElementsWithText(element, text, deepest)[0];
  }

  function getRestuarant() {
    const title = document.querySelector('meta[name="title"]')?.getAttribute("content")
    const restuarant = title.split('|')?.[1]?.trim()
    return restuarant;
  }

  function getTotalOrderPrice() {
    const subtotal = priceToNumber(
      getElementWithText('dt', texts.orderSubtotalPrice, true)?.parentNode?.querySelector('dd div')?.innerText
    );
    const delivery = priceToNumber(
      getElementWithText('dt', texts.orderDeliveryPrice, true)?.parentNode?.querySelector('dd div:last-of-type')?.innerText
    );
    const smallOrderFee = priceToNumber(
      getElementWithText('dt', texts.orderSmallFeePrice, true)?.parentNode?.querySelector('dd div')?.innerText
    );
    const tip = priceToNumber(
      getElementWithText('dt', texts.orderTipPrice, true)?.parentNode?.querySelector('dd div')?.innerText
    );
    const serviceFee = priceToNumber(
      getElementWithText('dt', texts.orderServiceFeePrice, true)?.parentNode?.querySelector('dd div')?.innerText
    );

    return subtotal + delivery + smallOrderFee + tip + serviceFee;
  }

  function priceToNumber(price) {
    if (typeof price !== "string") return 0;
    const maybeNumber = Number(price.replace(/[^0-9.-]+/g, ""));
    return isNaN(maybeNumber) ? 0 : maybeNumber;
  }

  function getGuestsOrders() {
    const guestsLineItems = getElementsWithText("li", texts.readyText);

    return guestsLineItems
      .map((item) => {
        const spans = [...item.querySelectorAll("span")].map(
          (s) => s.innerText
        );
        const name = spans?.[0];

        const price = priceToNumber(spans?.find((s) => s.includes("₪")));

        return {
          name,
          price,
        };
      })
      .filter((guest) => guest.name && guest.price);
  }

  function updateOrderButtonToSaveGuestsOrders() {
    const sendOrderButton = document.querySelector(
      '[data-test-id="SendOrderButton"]'
    );
    sendOrderButton.onclick = () => {
      const totalOrderPrice = getTotalOrderPrice();
      const guestsOrders = getGuestsOrders();
      const restaurant = getRestuarant();
      const orderTimestamp = Date.now();
      chrome.storage.local.set({
        totalOrderPrice,
        guestsOrders,
        orderTimestamp,
        restaurant,
      });
    };
    sendOrderButton.setAttribute(
      orderButtonHookSettings.saveOrdersAttribute,
      "true"
    );
  }

  function addWheelButton() {
    let src = chrome.runtime.getURL("/assets/hungry_wheel.png");
    let btnDiv = document.createElement("div");
    btnDiv.id = wheelButtonSettings.id;
    btnDiv.tabIndex = "0";
    btnDiv.style.backgroundImage = "url('" + src + "')";
    btnDiv.classList.add(wheelButtonSettings.id, "brand_item", "hover_btn");

    btnDiv.setAttribute("data-tooltip", texts.wheelButtonTooltip);

    btnDiv.onclick = () => {
      MicroModal.show("modal-random");
    }
    const woltMainBar = getWoltMainBar();
    woltMainBar?.insertAdjacentElement("afterbegin", btnDiv);
  }

  function getWoltMainBarForLoggedInUser() {
    const profileImage = document.querySelector(
      '[data-test-id="UserStatus.ProfileImage"]'
    );
    const profileImageButton = profileImage?.parentElement;
    const profileImageDiv = profileImageButton?.parentElement;
    return profileImageDiv?.parentElement;
  }

  function getWoltMainBarForLoggedOutUser() {
    const signupButton = document.querySelector(
      '[data-test-id="UserStatus.Signup"]'
    );
    const signupDiv = signupButton?.parentElement;
    const loginDiv = signupDiv?.parentElement;
    return loginDiv?.parentElement;
  }

  function getWoltMainBar() {
    return getWoltMainBarForLoggedInUser() || getWoltMainBarForLoggedOutUser();
  }

  function addCategoryModal() {
    if (!document.querySelector("#modal-random")) {
      const modalDiv = `<div class="modal micromodal-slide modal-pimpMyWolt" id="modal-random" aria-hidden="true">
    <div class="modal__overlay" tabindex="-1" data-micromodal-close>
    <div class="modal__container" role="dialog" aria-modal="true" aria-labelledby="modal-random-title">
    <header class="modal__header modal-header-pimpMyWolt">
          <img src="${logoUrl}"/>
          <h2 class="modal__title" id="modal-random-title">
            I'm Feeling Lucky
          </h2>
        </header>
      <div id="wheelOfFortune">
      <canvas id="wheel" width="300" height="300"></canvas>
      <div id="spin-pimpMyWolt">SPIN</div>
      </div>
        <footer class="modal__footer">
          <button id="order-btn-pimpMyWolt" class="modal__btn modal-buttons-pimpMyWolt modal__btn-primary disabled-pimpMyWolt" aria-label="Close this dialog window">Ok, let's order</button>
        </footer>
      </div>
    </div>
  </div>`;

      const modalContainer = document.createElement("div");
      modalContainer.innerHTML = modalDiv;

      document.querySelector("body").appendChild(modalContainer);
      wheel.init();

      const onClick = () => {
        const text = document
          .getElementById("spin-pimpMyWolt")
          .getAttribute("data-last-label");
        const linkRef = getCurrentLangugue(
          `https://wolt.com/en/search?q=${text}`,
          `https://wolt.com/he/search?q=${text}`
        );
        window.open(linkRef, "_blank");
        MicroModal.close();
      };

      document.getElementById("order-btn-pimpMyWolt").onclick = onClick;
    }
  }

  setInterval(async () => {
    addCategoryModal();

    if (!isWheelButtonExists() && isInMainPage()) {
      addWheelButton();
    }

    if (isOrderButtonExists() && !isOrderButtonUpdated()) {
      updateOrderButtonToSaveGuestsOrders();
    }

  }, 200);
})();
