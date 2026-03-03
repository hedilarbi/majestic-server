const PromoCode = require("../models/PromoCode");
const Subscription = require("../models/Subscription");

const serializeSubscription = (subscription) => ({
  id: subscription._id ? String(subscription._id) : null,
  name: subscription.name || "",
  description: subscription.description || "",
  price: subscription.price,
  totalCredits: subscription.totalCredits,
  expirationDate: subscription.expirationDate || null,
  isActive: subscription.isActive !== false,
  createdAt: subscription.createdAt || null,
});

const serializePromoCode = (promoCode) => ({
  id: promoCode._id ? String(promoCode._id) : null,
  code: promoCode.code || "",
  reductionValue: promoCode.reductionValue,
  reductionType: promoCode.reductionType || "",
  expiresAt: promoCode.expiresAt || null,
  totalUsageLimit:
    promoCode.totalUsageLimit === undefined ? null : promoCode.totalUsageLimit,
  userUsageLimit:
    promoCode.userUsageLimit === undefined ? null : promoCode.userUsageLimit,
  isActive: promoCode.isActive !== false,
  createdAt: promoCode.createdAt || null,
});

const listPublicOffers = async () => {
  const now = new Date();

  const [subscriptions, promoCodes] = await Promise.all([
    Subscription.find({
      isActive: true,
      expirationDate: { $gte: now },
    })
      .sort({ createdAt: -1 })
      .lean(),
    PromoCode.find({
      isActive: true,
      expiresAt: { $gte: now },
    })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  return {
    subscriptions: subscriptions.map(serializeSubscription),
    promoCodes: promoCodes.map(serializePromoCode),
  };
};

module.exports = {
  listPublicOffers,
};

