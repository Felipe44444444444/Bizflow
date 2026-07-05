// Token cost estimates (Claude Sonnet pricing)
const COSTS = {
  inputTokenCostUsd:  0.000003,   // $3 per 1M input tokens
  outputTokenCostUsd: 0.000015,   // $15 per 1M output tokens
  plans: {
    starter: { credits: 1000,  priceUsd: 29  },
    pro:     { credits: 5000,  priceUsd: 99  },
    agency:  { credits: 20000, priceUsd: 299 },
  },
};

function estimateCostUsd(tokensUsed = 0) {
  // Assume 70% input / 30% output split
  const inputTokens  = Math.floor(tokensUsed * 0.7);
  const outputTokens = Math.floor(tokensUsed * 0.3);
  return (inputTokens * COSTS.inputTokenCostUsd) + (outputTokens * COSTS.outputTokenCostUsd);
}

module.exports = { COSTS, estimateCostUsd };
