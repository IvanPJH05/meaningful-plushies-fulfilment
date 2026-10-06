import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from '../generated/api';


/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
  */

/**
  * @param {RunInput} input
  * @returns {CartLinesDiscountsGenerateRunResult}
  */

export function cartLinesDiscountsGenerateRun(input) {
  if (!input.cart.lines.length) {
    return {operations: []};
  }

  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product,
  );

  if (!hasProductDiscountClass) {
    return {operations: []};
  }

  // The collection ID is attached to the individual Shopify discount. This
  // makes a creator's code work only for the collection selected by staff.
  const eligibleLines = input.cart.lines.filter((line) => (
    line.merchandise.__typename === 'ProductVariant'
    && line.merchandise.product.eligibleForCreatorSample
  ));

  if (!eligibleLines.length) return {operations: []};

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: eligibleLines.map((line) => ({
            message: 'FREE CREATOR SAMPLE',
            targets: [{ cartLine: { id: line.id, quantity: 1 } }],
            value: { percentage: { value: 100 } },
          })),
          selectionStrategy: ProductDiscountSelectionStrategy.First,
        },
      },
    ],
  };
}
