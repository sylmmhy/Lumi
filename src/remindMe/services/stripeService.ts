// Replace these with your actual Stripe Price IDs from your Stripe Dashboard
// You can find these in the Stripe Dashboard under Products -> [Your Product] -> Pricing
export const STRIPE_PRICE_IDS = {
  WEEKLY: 'price_1234567890_weekly',
  MONTHLY: 'price_0987654321_monthly',
  SPECIAL_OFFER: 'price_special_offer_099',
}

export const createCheckoutSession = async (priceId: string): Promise<void> => {
  console.log(`[Stripe Service] Redirecting to Stripe Payment Link for Price ID: ${priceId}`)

  const baseUrl = 'https://buy.stripe.com/14AfZh1YSgfx2sU4168EM00'
  let url = baseUrl

  // Apply the specific promo code if it's the Special Offer ($0.99)
  if (priceId === STRIPE_PRICE_IDS.SPECIAL_OFFER) {
    // Appends the promo code parameter to the URL
    url = `${baseUrl}?prefilled_promo_code=promo_1SWrsUHIghgaklAS0vW1TPZz`
  }

  // Redirect to the constructed URL
  window.location.href = url

  // Return a promise that never resolves (since the page redirects) to prevent state updates on unmounted components
  return new Promise(() => {})
}
