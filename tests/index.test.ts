// Update test cases to use specific material types
it("should add materials with C:N ratio and type", () => {
  const pile = manager.createPile("Test Pile");
  const errors1 = manager.addInput({
    pileId: pile.id,
    materialType: MaterialType.GrassClippings,
    quantity: 10,
  });
  expect(errors1).toBeArrayOfSize(0);

  const errors2 = manager.addInput({
    pileId: pile.id,
    materialType: MaterialType.DryLeaves,
    quantity: 20,
    cnRatio: 50,
  });
  expect(errors2).toBeArrayOfSize(0);

  const state = manager.getPileState(pile.id);
  expect(state?.currentCNRatio).toBeCloseTo(40);
});

// Update other materialType references in tests