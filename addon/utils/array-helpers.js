function updateEmberArray(arrayProxy, newValues) {
  const removeSet = new Set(arrayProxy.content);
  const addSet = new Set(newValues);

  newValues.forEach((i) => removeSet.delete(i));
  arrayProxy.content.forEach((i) => addSet.delete(i));

  arrayProxy.removeObjects(Array.from(removeSet));
  arrayProxy.addObjects(Array.from(addSet));
}

export { updateEmberArray };
