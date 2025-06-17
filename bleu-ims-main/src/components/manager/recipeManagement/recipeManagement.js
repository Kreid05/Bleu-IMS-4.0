import React, { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import "./recipeManagement.css";
import Sidebar from "../../sidebar";
import { FaChevronDown, FaBell, FaFolderOpen, FaEdit, FaArchive } from "react-icons/fa";
import DataTable from "react-data-table-component";
import AddRecipeModal from "./modals/addRecipeModal";
import EditRecipeModal from "./modals/editRecipeModal";
import ViewRecipeModal from "./modals/viewRecipeModal";
import Header from "../../header";

const API_BASE_URL = "http://127.0.0.1:8005";
const getAuthToken = () => localStorage.getItem("access_token");
const DEFAULT_PROFILE_IMAGE = "https://media-hosting.imagekit.io/1123dd6cf5c544aa/screenshot_1746457481487.png?Expires=1841065483&Key-Pair-Id=K2ZIVPTIP2VGHC&Signature=kiHcXbHpirt9QHbMA4by~Kd4b2BrczywyVUfZZpks5ga3tnO8KlP8s5tdDpZQqinqOG30tGn0tgSCwVausjJ1OJ9~e6qPVjLXbglD-65hmsehYCZgEzeyGPPE-rOlyGJCgJC~GCZOu0jDKKcu2fefrClaqBBT3jaXoK4qhDPfjIFa2GCMfetybNs0RF8BtyKLgFGeEkvibaXhYxmzO8tksUKaLAMLbsPWvHBNuzV6Ar3mj~lllq7r7nrynNfdvbtuED7OGczSqZ8H-iopheAUhaWZftAh9tX2vYZCZZ8UztSEO3XUgLxMMtv9NnTei1omK00iJv1fgBjwR2lSqRk7w__";

function RecipeManagement() {
    const [isDropdownOpen, setDropdownOpen] = useState(false);
    const [loggedInUserDisplay, setLoggedInUserDisplay] = useState({ role: "User", name: "Current User" });
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState('nameAsc');
    const [products, setProducts] = useState([]);
    const [ingredients, setIngredients] = useState([]);
    const [supplies, setSupplies] = useState([]);
    const navigate = useNavigate();
    const getAuthToken = () => localStorage.getItem("access_token");

    // Fetch products, ingredients, and supplies data
    useEffect(() => {
        const fetchData = async () => {
            const token = getAuthToken();
            if (!token) {
                alert("Authentication token not found.");
                return;
            }

            try {
                // Fetch products
                const productsResponse = await fetch("http://127.0.0.1:8001/products/products/", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (productsResponse.ok) {
                    const productsData = await productsResponse.json();
                    setProducts(productsData);
                }

                // Fetch ingredients
                const ingredientsResponse = await fetch("http://127.0.0.1:8002/ingredients/ingredients/", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (ingredientsResponse.ok) {
                    const ingredientsData = await ingredientsResponse.json();
                    setIngredients(ingredientsData);
                }

                // Fetch supplies
                const suppliesResponse = await fetch("http://127.0.0.1:8003/materials/materials/", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (suppliesResponse.ok) {
                    const suppliesData = await suppliesResponse.json();
                    setSupplies(suppliesData);
                }
            } catch (error) {
                console.error("Error fetching data:", error);
                alert("Failed to fetch necessary data. Please try again.");
            }
        };

        fetchData();
    }, []);

    useEffect(() => {
        const token = getAuthToken();
        if (token) {
            try {
                const decodedToken = JSON.parse(atob(token.split('.')[1]));
                setLoggedInUserDisplay({
                    name: decodedToken.sub || "Current User",
                    role: decodedToken.role || "User"
                });
            } catch (error) {
                console.error("Error decoding token for display:", error);
            }
        }
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('access_token');
        navigate('/');
    };

    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [selectedRecipe, setSelectedRecipe] = useState(null);

    const currentDate = new Date().toLocaleString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "numeric", minute: "numeric", second: "numeric",
    });

    // Tab state
    const [activeTab, setActiveTab] = useState("recipe-drinks");

    // Separate data for drinks and foods
    const [drinks, setDrinks] = useState([
        { 
            id: 1, 
            name: "Americano", 
            description: "A Simple Coffee Drink Made By Diluting Espresso With Hot Water, Resulting In A Lighter, Bolder Flavor Than A Straight Espresso Shot.", 
            category: "Specialty Coffee" 
        },
    ]);

    const [foods, setFoods] = useState([
        { 
            id: 1, 
            name: "Chicken Sandwich", 
            description: "Grilled chicken breast with fresh lettuce, tomatoes, and special sauce on toasted bread.", 
            category: "Sandwich" 
        },
    ]);

    const handleView = (product) => {
        setSelectedRecipe(product);
        setShowViewModal(true);
    };

    const handleEdit = (product) => {
        setSelectedRecipe(product);
        setShowEditModal(true);
    };

    const handleDelete = (productId, type) => {
        const confirmDelete = window.confirm("Are you sure you want to delete this product?");
        if (confirmDelete) {
            if (type === "recipe-Drinks") {
                setDrinks((prev) => prev.filter((p) => p.id !== productId));
            } else {
                setFoods((prev) => prev.filter((p) => p.id !== productId));
            }
        }
    };

    const columns = (type) => [
        { name: "RECIPE NAME", selector: (row) => row.name, sortable: true, width: "25%" },
        { name: "PRODUCT DESCRIPTION", selector: (row) => row.description, wrap: true, width: "35%" },
        { name: "PRODUCT CATEGORY", selector: (row) => row.category, wrap: true, width: "20%" },
        {
            name: "ACTION",
            cell: (row) => (
            <div className="action-buttons">
                <button className="action-button view" onClick={() => handleView(row)}><FaFolderOpen /></button>
                <button className="action-button edit" onClick={() => handleEdit(row)}><FaEdit /></button>
                <button className="action-button delete" onClick={() => handleDelete(row.id, type)}><FaArchive /></button>
            </div>
            ),
            ignoreRowClick: true,
            allowOverflow: true,
            button: true,
            width: "20%",
        },
    ];

    return (
        <div className="recipeManagement">
            <Sidebar />
            <div className="roles">

                <Header pageTitle="Recipe Management" />

                <div className="recipeManagement-header">
                    <div className="recipe-top-row">
                        <button
                            className={`recipe-tab-button ${activeTab === "recipe-drinks" ? "active" : ""}`}
                            onClick={() => setActiveTab("recipe-drinks")}
                        >
                            Drinks
                        </button>
                        <button
                            className={`recipe-tab-button ${activeTab === "recipe-foods" ? "active" : ""}`}
                            onClick={() => setActiveTab("recipe-foods")}
                        >
                            Foods
                        </button>
                    </div>
                    <div className="recipe-bottom-row">
                        <input
                            type="text"
                            className="search-box"
                            placeholder="Search recipes..."
                        />
                        <div className="filter-container">
                            <label htmlFor="filter">Filter by:</label>
                            <select id="filter" className="filter-select">
                                <option value="all">All</option>
                                <option value="type">Categories</option>
                            </select>
                        </div>

                        <div className="sort-container">
                            <label htmlFor="sort">Sort by:</label>
                            <select id="sort" className="sort-select">
                                <option value="nameAsc">Name (A-Z)</option>
                                <option value="nameDesc">Name (Z-A)</option>
                                <option value="categoryAsc">Category (A-Z)</option>
                                <option value="categoryDesc">Category (Z-A)</option>
                            </select>
                        </div>
                        
                        <button className="add-recipe-button" onClick={() => setShowAddModal(true)} style={{ backgroundColor: '#4B929D', color: 'white', padding: '10px', fontWeight: 'bold', border: 'none', borderRadius: '6px', cursor: 'pointer', width: '150px' }}>+ Add Recipe</button>
                    </div>
                </div>

                <div className="recipeManagement-content">
                    <div className="recipe-grid">
                        {(activeTab === "recipe-drinks" ? drinks : foods).map((recipe) => (
                            <div key={recipe.id} className="recipe-card">
                                <div className="recipe-card-header">
                                    <h3>{recipe.name}</h3>
                                    <span className="recipe-category">{recipe.category}</span>
                                </div>
                                <p className="recipe-description">{recipe.description}</p>
                                <div className="recipe-actions">
                                    <button className="recipe-view-button" onClick={() => handleView(recipe)}>
                                        View Recipe
                                    </button>
                                    <button className="recipe-edit-button" onClick={() => handleEdit(recipe)}>
                                        Edit
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {showAddModal && (
                    <AddRecipeModal
                        onClose={() => setShowAddModal(false)}
                        onSubmit={(newRecipe) => {
                            if (activeTab === "recipe-drinks") {
                                setDrinks([...drinks, newRecipe]);
                            } else {
                                setFoods([...foods, newRecipe]);
                            }
                        }}
                        type={activeTab === "recipe-drinks" ? "drink" : "food"}
                       products={products}
                        ingredients={ingredients}
                        supplies={supplies}
                    />
                )}

                {showAddModal && (
                    <AddRecipeModal
                        onClose={() => setShowAddModal(false)}
                        onSubmit={(newRecipe) => {
                            if (activeTab === "recipe-drinks") {
                                setDrinks([...drinks, newRecipe]);
                            } else {
                                setFoods([...foods, newRecipe]);
                            }
                            setShowAddModal(false);
                        }}
                        type={activeTab === "recipe-drinks" ? "drink" : "food"}
                    />
                )}

                {showEditModal && selectedRecipe && (
                    <EditRecipeModal
                        recipe={selectedRecipe}
                        onClose={() => {
                            setShowEditModal(false);
                            setSelectedRecipe(null);
                        }}
                        onSubmit={(updatedRecipe) => {
                            if (activeTab === "recipe-drinks") {
                                setDrinks(drinks.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));
                            } else {
                                setFoods(foods.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));
                            }
                            setShowEditModal(false);
                            setSelectedRecipe(null);
                        }}
                        type={activeTab === "recipe-drinks" ? "drink" : "food"}
                    />
                )}

                {showViewModal && selectedRecipe && (
                    <ViewRecipeModal
                        recipe={selectedRecipe}
                        onClose={() => {
                            setShowViewModal(false);
                            setSelectedRecipe(null);
                        }}
                        onEdit={() => {
                            setShowViewModal(false);
                            setShowEditModal(true);
                        }}
                        type={activeTab === "recipe-drinks" ? "drink" : "food"}
                    />
                )}
            </div>
        </div>
    );
}

export default RecipeManagement;
