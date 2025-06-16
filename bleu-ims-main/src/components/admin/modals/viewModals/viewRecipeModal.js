import React from 'react';
import './viewRecipeModal.css';

function ViewRecipeModal({ recipe, onClose, onEdit, type }) {
    return (
        <div className="viewRecipe-modal-overlay">
            <div className="viewRecipe-modal-container">
                <div className="viewRecipe-modal-header">
                    <h3>{type === 'drink' ? 'Drink' : 'Food'} Recipe Details</h3>
                    <span className="viewRecipe-close-button" onClick={onClose}>&times;</span>
                </div>
                <div className="viewRecipe-modal-content">
                    <div className="recipe-detail">
                        <h4>Recipe Name</h4>
                        <p>{recipe.name}</p>
                    </div>

                    <div className="recipe-detail">
                        <h4>Description</h4>
                        <p>{recipe.description}</p>
                    </div>

                    <div className="recipe-detail">
                        <h4>Category</h4>
                        <p>{recipe.category}</p>
                    </div>

                    <div className="recipe-detail">
                        <h4>Ingredients</h4>
                        <div className="ingredients-list">
                            {recipe.ingredients && recipe.ingredients.map((ingredient, index) => (
                                <div key={index} className="ingredient-item">
                                    <span>{ingredient.name}</span>
                                    <span>{ingredient.amount} {ingredient.unit}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                  
                    <div className="viewRecipe-button-container">
                        <button
                            className="viewRecipe-edit-button"
                            onClick={() => onEdit(recipe)}
                        >
                            Edit Recipe
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ViewRecipeModal;