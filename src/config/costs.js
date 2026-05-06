const COSTS = {
  embeddings: { model: 'text-embedding-3-small', usdPer1MTokens: 0.02 },
  completion: {
    model: 'claude-sonnet-4-6',
    inputUsdPer1MTokens: 3.0,
    outputUsdPer1MTokens: 15.0,
  },
  plans: {
    starter:    { priceUsd: 29,  credits: 1000   },
    pro:        { priceUsd: 79,  credits: 10000  },
    enterprise: { priceUsd: 249, credits: 999999 },
  },
};

function estimateCostUsd(tokensUsed) {
  const input  = tokensUsed * 0.8;
  const output = tokensUsed * 0.2;
  return (
    (input  / 1_000_000) * COSTS.completion.inputUsdPer1MTokens +
    (output / 1_000_000) * COSTS.completion.outputUsdPer1MTokens
  );
}

module.exports = { COSTS, estimateCostUsd };
