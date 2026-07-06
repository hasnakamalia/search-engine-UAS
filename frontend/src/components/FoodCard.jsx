export default function FoodCard({ item }) {
  return (
    <div className="card">
      <img
        className="card-img"
        src={item.image}
        alt={item.name}
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
        }}
      />
      <div className="card-body">
        <h3>{item.name}</h3>
        {item.description && <p>{item.description}</p>}
        <div className="label">
          <div className="label-title">Informasi Gizi / 100g</div>
          <div className="label-row">
            <span>Kalori</span>
            <span className="val">{item.calories} kkal</span>
          </div>
          <div className="label-row">
            <span>Protein</span>
            <span className="val">{item.proteins} g</span>
          </div>
          <div className="label-row">
            <span>Lemak</span>
            <span className="val">{item.fat} g</span>
          </div>
          <div className="label-row">
            <span>Karbohidrat</span>
            <span className="val">{item.carbohydrate} g</span>
          </div>
        </div>
      </div>
    </div>
  );
}
