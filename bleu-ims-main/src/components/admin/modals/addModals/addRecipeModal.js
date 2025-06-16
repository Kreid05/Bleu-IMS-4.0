import React, { useState } from "react";
import "./addRecipeModal.css";

const API_BASE_URL = "http://127.0.0.1:8005";
const getAuthToken = () => localStorage.getItem("access_token");

function AddRecipeModal({ onClose, onSubmit, type, products, initialIngredients, supplies: availableSupplies }) {
    const [recipeName, setRecipeName] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState("");
    const [product, setProduct] = useState("");
    const [ingredients, setIngredients] = useState([]);
    const [recipeSupplies, setRecipeSupplies] = useState([]);
    
    const drinkCategories = [
        "Barista Choice",
        "Specialty Coffee",
        "Premium Coffee",
        "Non-Coffee",
        "Frappe",
        "Sparkling Series",
        "Milktea"
    ];

    const foodCategories = [
        "Rice Meals",
        "Pasta",
        "Snacks",
        "Sandwich"
    ];

    const [errors, setErrors] = useState({
        recipeName: "",
        description: "",
        category: "",
        ingredients: ""
    });

    const handleAddIngredient = () => {
        setIngredients([...ingredients, { name: "", amount: "", measurement: "" }]);
    };

    const handleIngredientChange = (index, field, value) => {
        const newIngredients = [...ingredients];
        newIngredients[index][field] = value;
        setIngredients(newIngredients);
    };

    const handleRemoveIngredient = (index) => {
        const newIngredients = ingredients.filter((_, i) => i !== index);
        setIngredients(newIngredients);
    };

    const handleFocus = (field) => {
        setErrors((prevErrors) => ({
            ...prevErrors,
            [field]: ""
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const newErrors = {};
        if (!recipeName) newErrors.recipeName = "Recipe name is required";
        if (!description) newErrors.description = "Description is required";
        if (!category) newErrors.category = "Category is required";
        if (ingredients.length === 0) newErrors.ingredients = "At least one ingredient is required";

        setErrors(newErrors);

        if (Object.keys(newErrors).length === 0) {
            const token = getAuthToken();
            if (!token) {
                alert("Authentication token not found.");
                return;
            }

            const newRecipe = {
                name: recipeName,
                description: description,
                category: category,
                ingredients: ingredients,
                supplies: recipeSupplies,
                type: type // 'drink' or 'food'
            };

            try {
                const response = await fetch(`${API_BASE_URL}/recipes/recipes/`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify(newRecipe)
                });

                if (!response.ok) {
                    throw new Error("Failed to add recipe.");
                }

                const result = await response.json();
                if (onSubmit) onSubmit(result);
                onClose();

            } catch (error) {
                console.error("Error adding recipe:", error);
                alert("Failed to add recipe.");
            }
        }
    };

    return (
        <div className="addRecipe-modal-overlay">
            <div className="addRecipe-modal-container">
                <div className="addRecipe-modal-header">
                    <h3>Add {type === "drink" ? "Drink" : "Food"} Recipe</h3>
                    <span className="addRecipe-close-button" onClick={onClose}>&times;</span>
                </div>
                <form className="addRecipe-modal-form" onSubmit={handleSubmit}>
                    {/* Recipe Name */}
                    <div className="recipe-form-group">
                        <label>
                            Recipe Name <span className="required">*</span>
                        </label>
                        <input
                            type="text"
                            value={recipeName}
                            onChange={(e) => setRecipeName(e.target.value)}
                            onFocus={() => handleFocus('recipeName')}
                            className={errors.recipeName ? 'error' : ''}
                        />
                        {errors.recipeName && <p className="error-message">{errors.recipeName}</p>}
                    </div>

                    {/* Category and Product Row */}
                    <div className="recipe-form-row">
                        <div className="recipe-form-group">
                            <label>
                                Category <span className="required">*</span>
                            </label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                onFocus={() => handleFocus('category')}
                                className={errors.category ? 'error' : ''}
                            >
                                <option value="">Select a category</option>
                                {type === "drink" 
                                    ? drinkCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))
                                    : foodCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))
                                }
                            </select>
                            {errors.category && <p className="error-message">{errors.category}</p>}
                        </div>
                        <div className="recipe-form-group">
                            <label>
                                Product <span className="required">*</span>
                            </label>
                            <select
                                value={product}
                                onChange={(e) => setProduct(e.target.value)}
                                className={errors.product ? 'error' : ''}
                            >
                                <option value="">Select a product</option>
                                {products && products.map(product => (
                                    <option key={product.ProductID} value={product.ProductID}>
                                        {product.ProductName}
                                    </option>
                                ))}
                            </select>
                            {errors.product && <p className="error-message">{errors.product}</p>}
                        </div>
                    </div>

                    {/* Ingredients Section */}
                    <div className="recipe-section">
                        <h4>Ingredients <span className="required">*</span></h4>
                        <button
                            type="button"
                            onClick={handleAddIngredient}
                            className="recipe-add-button"
                        >
                            + Add Ingredient
                        </button>
                        {ingredients.length === 0 ? (
                            <div className="recipe-no-items">No ingredients added yet</div>
                        ) : (
                            ingredients.map((ingredient, index) => (
                                <div key={index} className="recipe-item">
                                    <div className="recipe-item-row">
                                        <div className="recipe-item-field">
                                            <label>Ingredient</label>
                                            <select
                                                value={ingredient.name}
                                                onChange={(e) => handleIngredientChange(index, 'name', e.target.value)}
                                            >
                                                <option value="">Select an ingredient</option>
                                                {initialIngredients && initialIngredients.map(ing => (
                                                    <option key={ing.IngredientID} value={ing.IngredientID}>
                                                        {ing.IngredientName}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="recipe-item-field">
                                            <label>Amount</label>
                                            <input
                                                type="number"
                                                value={ingredient.amount}
                                                onChange={(e) => handleIngredientChange(index, 'amount', e.target.value)}
                                            />
                                        </div>
                                        <div className="recipe-item-field">
                                            <label>Units</label>
                                            <input
                                                type="text"
                                                value={ingredient.measurement}
                                                onChange={(e) => handleIngredientChange(index, 'measurement', e.target.value)}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveIngredient(index)}
                                            className="recipe-remove-button"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                        {errors.ingredients && <p className="error-message">{errors.ingredients}</p>}
                    </div>

                    {/* Supplies Section */}
                    <div className="recipe-section">
                        <h4>Supplies</h4>
                        <button
                            type="button"
                            onClick={() => setRecipeSupplies([...recipeSupplies, { name: "", amount: "", measurement: "" }])}
                            className="recipe-add-button"
                        >
                            + Add Supply
                        </button>
                        {recipeSupplies.length === 0 ? (
                            <div className="recipe-no-items">No supplies added yet</div>
                        ) : (
                            recipeSupplies.map((supply, index) => (
                                <div key={index} className="recipe-item">
                                    <div className="recipe-item-row">
                                        <div className="recipe-item-field">
                                            <label>Supply</label>
                                            <select
                                                value={supply.name}
                                                onChange={(e) => {
                                                    const newSupplies = [...recipeSupplies];
                                                    newSupplies[index].name = e.target.value;
                                                    setRecipeSupplies(newSupplies);
                                                }}
                                            >
                                                <option value="">Select a supply</option>
                                                {availableSupplies && availableSupplies.map(sup => (
                                                    <option key={sup.SupplyID} value={sup.SupplyID}>
                                                        {sup.SupplyName}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="recipe-item-field">
                                            <label>Amount</label>
                                            <input
                                                type="number"
                                                value={supply.amount}
                                                onChange={(e) => {
                                                    const newSupplies = [...recipeSupplies];
                                                    newSupplies[index].amount = e.target.value;
                                                    setRecipeSupplies(newSupplies);
                                                }}
                                            />
                                        </div>
                                        <div className="recipe-item-field">
                                            <label>Units</label>
                                            <input
                                                type="text"
                                                value={supply.measurement}
                                                onChange={(e) => {
                                                    const newSupplies = [...recipeSupplies];
                                                    newSupplies[index].measurement = e.target.value;
                                                    setRecipeSupplies(newSupplies);
                                                }}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const newSupplies = recipeSupplies.filter((_, i) => i !== index);
                                                setRecipeSupplies(newSupplies);
                                            }}
                                            className="recipe-remove-button"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Description - moved below supplies */}
                    <div className="recipe-form-group">
                        <label>
                            Description <span className="required">*</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            onFocus={() => handleFocus('description')}
                            className={errors.description ? 'error' : ''}
                        />
                        {errors.description && <p className="error-message">{errors.description}</p>}
                    </div>

                    {/* Submit Button */}
                    <div className="addRecipe-button-container">
                        <button type="submit" className="addRecipe-submit-button">
                            Add Recipe
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AddRecipeModal;