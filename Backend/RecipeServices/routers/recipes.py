from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from typing import List
import httpx
from database import get_db_connection

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="http://localhost:4000/auth/token")
router = APIRouter(prefix="/recipes", tags=["recipes"])

# models
class IngredientInRecipe(BaseModel):
    IngredientID: int
    Amount: float
    Measurement: str

class MaterialInRecipe(BaseModel):
    MaterialID: int
    Quantity: float
    Measurement: str

class RecipeCreate(BaseModel):
    ProductID: int
    RecipeName: str
    Ingredients: List[IngredientInRecipe]
    Materials: List[MaterialInRecipe]

class RecipeUpdate(RecipeCreate):
    pass

class RecipeOut(BaseModel):
    RecipeID: int
    ProductID: int
    RecipeName: str
    Ingredients: List[dict]
    Materials: List[dict]

# auth validation
async def validate_token_and_roles(token: str, allowed_roles: List[str], allowed_systems: List[str] = ["IMS"]):
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "http://localhost:4000/auth/users/me",
            headers={"Authorization": f"Bearer {token}"}
        )
    if response.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    
    user_data = response.json()
    user_role = user_data.get("userRole")
    user_system = user_data.get("system")
    if user_role not in allowed_roles or user_system not in allowed_systems:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

# get all recipes
@router.get("/", response_model=List[RecipeOut])
async def get_all_recipes(token: str = Depends(oauth2_scheme)):
    await validate_token_and_roles(token, ["admin", "manager", "staff"])
    conn = await get_db_connection()
    async with conn.cursor() as cursor:
        await cursor.execute("SELECT * FROM Recipes")
        recipes = await cursor.fetchall()
        result = []

        for recipe in recipes:
            await cursor.execute("""
                SELECT ri.RecipeIngredientID, ri.Amount, i.IngredientName, i.Measurement
                FROM RecipeIngredients ri
                JOIN Ingredients i ON ri.IngredientID = i.IngredientID
                WHERE ri.RecipeID = ?
            """, (recipe.RecipeID,))
            ingredients = await cursor.fetchall()

            await cursor.execute("""
                SELECT rm.RecipeMaterialID, rm.Quantity, m.MaterialName, m.MaterialMeasurement
                FROM RecipeMaterials rm
                JOIN Materials m ON rm.MaterialID = m.MaterialID
                WHERE rm.RecipeID = ?
            """, (recipe.RecipeID,))
            materials = await cursor.fetchall()

            result.append({
                "RecipeID": recipe.RecipeID,
                "ProductID": recipe.ProductID,
                "RecipeName": recipe.RecipeName,
                "Ingredients": [
                    {
                        "RecipeIngredientID": row.RecipeIngredientID,
                        "IngredientName": row.IngredientName,
                        "Amount": row.Amount,
                        "Measurement": row.Measurement
                    } for row in ingredients
                ],
                "Materials": [
                    {
                        "RecipeMaterialID": row.RecipeMaterialID,
                        "MaterialName": row.MaterialName,
                        "Quantity": row.Quantity,
                        "Measurement": row.MaterialMeasurement
                    } for row in materials
                ]
            })
    return result

# get recipe details
@router.get("/{recipe_id}", response_model=RecipeOut)
async def get_recipe(recipe_id: int, token: str = Depends(oauth2_scheme)):
    await validate_token_and_roles(token, ["admin", "manager", "staff"])
    conn = await get_db_connection()
    async with conn.cursor() as cursor:
        await cursor.execute("SELECT * FROM Recipes WHERE RecipeID = ?", (recipe_id,))
        recipe = await cursor.fetchone()
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")

        await cursor.execute("""
            SELECT ri.RecipeIngredientID, ri.Amount, i.IngredientName, i.Measurement
            FROM RecipeIngredients ri
            JOIN Ingredients i ON ri.IngredientID = i.IngredientID
            WHERE ri.RecipeID = ?
        """, (recipe_id,))
        ingredients = await cursor.fetchall()

        await cursor.execute("""
            SELECT rm.RecipeMaterialID, rm.Quantity, m.MaterialName, m.MaterialMeasurement
            FROM RecipeMaterials rm
            JOIN Materials m ON rm.MaterialID = m.MaterialID
            WHERE rm.RecipeID = ?
        """, (recipe_id,))
        materials = await cursor.fetchall()

        return {
            "RecipeID": recipe.RecipeID,
            "ProductID": recipe.ProductID,
            "RecipeName": recipe.RecipeName,
            "Ingredients": [
                {
                    "RecipeIngredientID": row.RecipeIngredientID,
                    "IngredientName": row.IngredientName,
                    "Amount": row.Amount,
                    "Measurement": row.Measurement
                } for row in ingredients
            ],
            "Materials": [
                {
                    "RecipeMaterialID": row.RecipeMaterialID,
                    "MaterialName": row.MaterialName,
                    "Quantity": row.Quantity,
                    "Measurement": row.MaterialMeasurement
                } for row in materials
            ]
        }

# create recipe
@router.post("/", response_model=dict)
async def create_recipe(recipe: RecipeCreate, token: str = Depends(oauth2_scheme)):
    await validate_token_and_roles(token, ["admin", "manager", "staff"])
    conn = await get_db_connection()
    async with conn.cursor() as cursor:

        # duplicate check
        await cursor.execute("""
            SELECT 1 FROM Recipes
            WHERE RecipeName COLLATE Latin1_General_CI_AS = ?
        """, recipe.RecipeName)
        if await cursor.fetchone():
            raise HTTPException(status_code=400, detail="Recipe name already exists.")
        
        await cursor.execute("""
            INSERT INTO Recipes (ProductID, RecipeName)
            OUTPUT INSERTED.RecipeID
            VALUES (?, ?)
        """, recipe.ProductID, recipe.RecipeName)
        new_id = (await cursor.fetchone()).RecipeID

        for ing in recipe.Ingredients:
            await cursor.execute("""
                INSERT INTO RecipeIngredients (RecipeID, IngredientID, Amount, Measurement)
                VALUES (?, ?, ?, ?)
            """, new_id, ing.IngredientID, ing.Amount, ing.Measurement)

        for mat in recipe.Materials:
            await cursor.execute("""
                INSERT INTO RecipeMaterials (RecipeID, MaterialID, Quantity, Measurement)
                VALUES (?, ?, ?, ?)
            """, new_id, mat.MaterialID, mat.Quantity, mat.Measurement)

    return {"message": "Recipe created successfully", "RecipeID": new_id}

# update recipe
@router.put("/{recipe_id}", response_model=dict)
async def update_recipe(recipe_id: int, recipe: RecipeUpdate, token: str = Depends(oauth2_scheme)):
    await validate_token_and_roles(token, ["admin", "manager", "staff"])
    conn = await get_db_connection()
    async with conn.cursor() as cursor:
        
         # duplicate check 
        await cursor.execute("""
            SELECT 1 FROM Recipes
            WHERE RecipeName COLLATE Latin1_General_CI_AS = ? AND RecipeID != ?
        """, recipe.RecipeName, recipe_id)
        if await cursor.fetchone():
            raise HTTPException(status_code=400, detail="Recipe name already exists.")

        await cursor.execute("""
            UPDATE Recipes SET ProductID = ?, RecipeName = ? WHERE RecipeID = ?
        """, recipe.ProductID, recipe.RecipeName, recipe_id)

        await cursor.execute("DELETE FROM RecipeIngredients WHERE RecipeID = ?", (recipe_id,))
        for ing in recipe.Ingredients:
            await cursor.execute("""
                INSERT INTO RecipeIngredients (RecipeID, IngredientID, Amount, Measurement)
                VALUES (?, ?, ?, ?)
            """, recipe_id, ing.IngredientID, ing.Amount, ing.Measurement)

        await cursor.execute("DELETE FROM RecipeMaterials WHERE RecipeID = ?", (recipe_id,))
        for mat in recipe.Materials:
            await cursor.execute("""
                INSERT INTO RecipeMaterials (RecipeID, MaterialID, Quantity, Measurement)
                VALUES (?, ?, ?, ?)
            """, recipe_id, mat.MaterialID, mat.Quantity, mat.Measurement)

    return {"message": "Recipe updated successfully"}

# delete recipe
@router.delete("/{recipe_id}", response_model=dict)
async def delete_recipe(recipe_id: int, token: str = Depends(oauth2_scheme)):
    await validate_token_and_roles(token, ["admin", "manager", "staff"])
    conn = await get_db_connection()
    async with conn.cursor() as cursor:
        await cursor.execute("DELETE FROM RecipeIngredients WHERE RecipeID = ?", (recipe_id,))
        await cursor.execute("DELETE FROM RecipeMaterials WHERE RecipeID = ?", (recipe_id,))
        await cursor.execute("DELETE FROM Recipes WHERE RecipeID = ?", (recipe_id,))
    return {"message": "Recipe deleted successfully"}
