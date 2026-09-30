import pip
import streamlit as st
import pyvista as pv
import stpyvista
import os

def render_3d_model(model_path, color='lightblue', key_prefix="viewer"):
    """
    Renders a 3D model using the robust PyVista engine.
    """
    try:
        plotter = pv.Plotter(window_size=[600, 400], border=False)
        plotter.background_color = 'white', 0.0 # Transparent background
        
        mesh = pv.read(model_path)
        
        plotter.add_mesh(mesh, color=color, style='surface', smooth_shading=True, specular=1.0, specular_power=15)
        
        plotter.view_isometric()
        plotter.camera.zoom(1.5)
        
        stpyvista(plotter, key=f"{key_prefix}_{os.path.basename(model_path)}")

    except FileNotFoundError:
        st.error(f"3D model file not found! Ensure '{model_path}' exists.")
    except Exception as e:
        st.error(f"An error occurred loading the 3D model with PyVista: {e}")